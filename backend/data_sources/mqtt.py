import json
import os
import time
import logging
from typing import Dict, Optional
import paho.mqtt.client as mqtt
from backend.data_sources.base import DataSource

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("MqttSource")

class MqttSource(DataSource):
    """
    Plug-and-play MQTT telemetry subscriber.
    Allows actual machines / PLCs to stream sensor values directly.
    Auto-enriches flat sensor payloads using the machine_registry.json config.
    """
    def __init__(self, registry_path: str = None):
        if registry_path is None:
            registry_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), 
                "config", 
                "machine_registry.json"
            )
        
        with open(registry_path, "r") as f:
            self.registry = json.load(f)

        # Connection configs
        self.broker = os.getenv("MQTT_BROKER", "localhost")
        self.port = int(os.getenv("MQTT_PORT", "1883"))
        self.username = os.getenv("MQTT_USER", None)
        self.password = os.getenv("MQTT_PASSWORD", None)
        self.topic_prefix = os.getenv("MQTT_TOPIC_PREFIX", "edgetwin/telemetry")
        
        # Cache for latest telemetry readings per machine: machine_id -> enriched_reading
        self.telemetry_cache = {}
        self.client = None
        self.is_running = False

    async def start(self):
        """Initialize the MQTT Client connection and subscribe to topics."""
        if self.is_running:
            return

        self.client = mqtt.Client(client_id="EdgeTwinCopilot_Ingest", clean_session=True)
        
        if self.username and self.password:
            self.client.username_pw_set(self.username, self.password)

        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect

        logger.info(f"MQTT Source: Connecting to broker {self.broker}:{self.port}...")
        try:
            self.client.connect(self.broker, self.port, keepalive=60)
            self.client.loop_start()
            self.is_running = True
        except Exception as e:
            logger.error(f"MQTT Source: Connection failed: {e}. Running in standby.")

    async def stop(self):
        """Gracefully disconnect the client."""
        if not self.is_running:
            return
        logger.info("MQTT Source: Stopping listener...")
        self.is_running = False
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("MQTT Source: Connected to broker successfully.")
            # Subscribe to all machine telemetry topics using wildcard
            subscribe_topic = f"{self.topic_prefix}/+"
            self.client.subscribe(subscribe_topic)
            logger.info(f"MQTT Source: Subscribed to telemetry topic: {subscribe_topic}")
        else:
            logger.error(f"MQTT Source: Connection refused with code {rc}")

    def _on_disconnect(self, client, userdata, rc):
        logger.warning(f"MQTT Source: Disconnected from broker (code: {rc})")

    def _on_message(self, client, userdata, msg):
        try:
            # Parse topic to extract machine_id (topic prefix: prefix/machine_id)
            topic_parts = msg.topic.split('/')
            machine_id = topic_parts[-1]
            
            payload_str = msg.payload.decode('utf-8')
            flat_telemetry = json.loads(payload_str)
            
            enriched = self._enrich_telemetry(machine_id, flat_telemetry)
            if enriched:
                self.telemetry_cache[machine_id] = enriched
                
        except Exception as e:
            logger.error(f"MQTT Source: Error parsing message: {e}")

    def _enrich_telemetry(self, machine_id: str, flat_data: dict) -> Optional[dict]:
        """Looks up registry configuration to convert a flat reading to structured telemetry."""
        machine_config = None
        for m in self.registry["machines"]:
            if m["machine_id"] == machine_id:
                machine_config = m
                break
                
        if not machine_config:
            logger.warning(f"MQTT Source: Received telemetry for unrecognized machine ID: {machine_id}")
            return None

        enriched_sensors = {}
        for sensor in machine_config["sensors"]:
            s_id = sensor["sensor_id"]
            s_type = sensor["type"]
            unit = sensor["unit"]
            norm_min, norm_max = sensor["normal_range"]

            # If real machine doesn't send the value, fall back to mid normal range value
            val = flat_data.get(s_id, None)
            if val is None:
                val = (norm_min + norm_max) / 2.0
                
            enriched_sensors[s_id] = {
                "value": float(val),
                "type": s_type,
                "unit": unit
            }

        return {
            "machine_id": machine_id,
            "machine_type": machine_config["machine_type"],
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "machine_state": flat_data.get("machine_state", "Normal"),
            "sensors": enriched_sensors
        }

    async def get_reading(self, machine_id: str) -> Dict:
        """Returns the latest cached reading from MQTT, falling back to a safe normal baseline if disconnected."""
        if machine_id in self.telemetry_cache:
            return self.telemetry_cache[machine_id]
        
        # Fallback normal baseline if no MQTT message has arrived yet
        logger.debug(f"MQTT Source: Cache miss for {machine_id}. Returning normal baseline.")
        return self._enrich_telemetry(machine_id, {})
