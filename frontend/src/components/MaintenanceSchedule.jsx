import React, { useState, useEffect } from 'react';
import { Calendar, Wrench, Clock, CheckCircle2, AlertTriangle, Plus, ChevronRight, X, PackageOpen, ShoppingCart, Check } from 'lucide-react';

function MaintenanceSchedule({ selectedMachine, selectedMachineId, healthScore, onLogService }) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [actionNotes, setActionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('logs'); // 'logs', 'parts', or 'orders'
  const [purchaseOrders, setPurchaseOrders] = useState([]);

  // Fetch purchase orders for the active machine (Priority 3 Roadmap Integration)
  const fetchPurchaseOrders = async () => {
    if (!selectedMachineId) return;
    try {
      const res = await fetch(`http://localhost:8000/api/machines/${selectedMachineId}/purchase-orders`);
      if (res.ok) {
        const data = await res.json();
        setPurchaseOrders(data);
      }
    } catch (err) {
      console.error('Failed to fetch purchase orders:', err);
    }
  };

  useEffect(() => {
    fetchPurchaseOrders();
    // Set up a 5-second interval to refresh orders
    const interval = setInterval(fetchPurchaseOrders, 5000);
    return () => clearInterval(interval);
  }, [selectedMachineId]);

  const handleApproveOrder = async (orderId) => {
    try {
      const token = localStorage.getItem('edgetwin_token');
      const res = await fetch(`http://localhost:8000/api/purchase-orders/${orderId}/approve`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        await fetchPurchaseOrders();
        if (onLogService) await onLogService();
      } else if (res.status === 401) {
        alert("Unauthorized: Please log in using the administrator control panel to approve purchase orders.");
      }
    } catch (err) {
      console.error('Failed to approve purchase order:', err);
    }
  };

  const handleRejectOrder = async (orderId) => {
    try {
      const token = localStorage.getItem('edgetwin_token');
      const res = await fetch(`http://localhost:8000/api/purchase-orders/${orderId}/reject`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        await fetchPurchaseOrders();
      } else if (res.status === 401) {
        alert("Unauthorized: Please log in using the administrator control panel to reject purchase orders.");
      }
    } catch (err) {
      console.error('Failed to reject purchase order:', err);
    }
  };

  if (!selectedMachine) return null;

  const sched = selectedMachine.maintenance_schedule || {
    last_service_date: 'N/A',
    next_service_date: 'N/A',
    pm_interval_days: 45,
    service_history: []
  };

  const getDaysRemaining = () => {
    if (sched.next_service_date === 'N/A') return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDate = new Date(sched.next_service_date);
    nextDate.setHours(0, 0, 0, 0);
    const diffTime = nextDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysRemaining = getDaysRemaining();
  const currentHealth = healthScore ?? 100;

  const getStatus = () => {
    if (currentHealth < 75) {
      return {
        label: 'Unscheduled Action Required',
        color: 'text-red-400 bg-red-950/40 border-red-500/30 shadow-red-500/10',
        icon: AlertTriangle
      };
    }
    if (daysRemaining === null) {
      return {
        label: 'No Schedule Set',
        color: 'text-slate-400 bg-slate-900/60 border-white/5',
        icon: Clock
      };
    }
    if (daysRemaining < 0) {
      return {
        label: `Overdue by ${Math.abs(daysRemaining)} Days`,
        color: 'text-red-400 bg-red-950/40 border-red-500/30 shadow-red-500/10',
        icon: AlertTriangle
      };
    }
    if (daysRemaining <= 10) {
      return {
        label: `Due in ${daysRemaining} Days`,
        color: 'text-amber-400 bg-amber-950/40 border-amber-500/30 shadow-amber-500/10',
        icon: Clock
      };
    }
    return {
      label: 'Schedule Healthy',
      color: 'text-emerald-400 bg-emerald-950/40 border-emerald-500/30 shadow-emerald-500/10',
      icon: CheckCircle2
    };
  };

  const status = getStatus();
  const StatusIcon = status.icon;

  const handleLogMaintenance = async (e) => {
    e.preventDefault();
    if (!actionNotes.trim() || !selectedMachineId) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('edgetwin_token');
      const res = await fetch(`http://localhost:8000/api/machines/${selectedMachineId}/maintenance`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ action: actionNotes.trim() })
      });
      if (res.ok) {
        setActionNotes('');
        setShowLogModal(false);
        if (onLogService) await onLogService();
      } else if (res.status === 401) {
        alert("Unauthorized: Please log in using the administrator control panel to log maintenance.");
      }
    } catch (err) {
      console.error('Failed to log maintenance event:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = purchaseOrders.filter(o => o.status === 'Pending Approval').length;

  return (
    <div className="bg-slate-900/40 border border-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col h-[305px] card-hover relative overflow-hidden transition-all duration-300">
      
      {/* Accent design line */}
      <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-blue-500/30 to-transparent"></div>

      {/* Header */}
      <div className="flex justify-between items-center mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <Wrench className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Preventive Maintenance</h4>
            <p className="text-[9px] text-slate-500 font-mono">Interval: {sched.pm_interval_days} Days</p>
          </div>
        </div>

        <button
          onClick={() => setShowLogModal(true)}
          className="bg-slate-950/80 border border-white/5 hover:border-blue-500/40 text-[9px] text-blue-400 font-bold px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer hover:bg-blue-900/20"
        >
          <Plus className="w-3.5 h-3.5" /> LOG SERVICE
        </button>
      </div>

      {/* Status Banner */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-xl mb-3 text-[10px] font-bold ${status.color} shadow-sm shrink-0`}>
        <StatusIcon className="w-4 h-4 shrink-0" />
        <span className="uppercase tracking-wider">{status.label}</span>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-slate-950/60 border border-white/5 rounded-xl p-0.5 mb-3 shrink-0">
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex-1 py-1 text-[8px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'logs' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/25' : 'text-slate-550 hover:text-slate-300'
          }`}
        >
          Service Log
        </button>
        <button
          onClick={() => setActiveTab('parts')}
          className={`flex-1 py-1 text-[8px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
            activeTab === 'parts' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/25' : 'text-slate-550 hover:text-slate-300'
          }`}
        >
          BOM
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 py-1 text-[8px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all cursor-pointer relative ${
            activeTab === 'orders' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/25' : 'text-slate-550 hover:text-slate-300'
          }`}
        >
          Orders
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-[8px] font-black text-slate-950 ring-2 ring-slate-900 animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'logs' ? (
        <>
          {/* Grid of details */}
          <div className="grid grid-cols-2 gap-3 mb-3 shrink-0">
            <div className="bg-slate-950/40 border border-white/5 rounded-xl p-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <div className="text-[7px] text-slate-500 font-bold uppercase tracking-wider">Last Serviced</div>
                <div className="text-[10px] font-black text-white mt-0.5 font-mono">{sched.last_service_date}</div>
              </div>
            </div>
            <div className="bg-slate-950/40 border border-white/5 rounded-xl p-2 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <div>
                <div className="text-[7px] text-slate-500 font-bold uppercase tracking-wider">Next Scheduled</div>
                <div className="text-[10px] font-black text-white mt-0.5 font-mono">{sched.next_service_date}</div>
              </div>
            </div>
          </div>

          {/* History Log */}
          <div className="flex-1 min-h-0 flex flex-col">
            <span className="text-[8px] font-black text-slate-550 uppercase tracking-widest block mb-1 font-mono">
              Recent Service Actions
            </span>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {sched.service_history && sched.service_history.length > 0 ? (
                sched.service_history.map((item, idx) => (
                  <div key={idx} className="flex items-start gap-2 bg-slate-950/20 border border-white/5 rounded-lg p-2 text-[10px] leading-tight">
                    <ChevronRight className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-300 font-medium truncate">{item.action}</p>
                      <span className="text-[8px] text-slate-600 font-mono block mt-0.5">{item.date}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-[9px] text-slate-600 font-mono text-center py-4">
                  No historical service logs found.
                </div>
              )}
            </div>
          </div>
        </>
      ) : activeTab === 'parts' ? (
        /* Spare Parts (BOM) */
        <div className="flex-1 min-h-0 flex flex-col">
          <span className="text-[8px] font-black text-slate-550 uppercase tracking-widest block mb-1.5 font-mono">
            Active Spare Inventory
          </span>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {selectedMachine.spare_parts && selectedMachine.spare_parts.length > 0 ? (
              selectedMachine.spare_parts.map((part) => {
                const isLow = part.stock <= 2;
                const isOutOfStock = part.stock === 0;
                return (
                  <div key={part.part_id} className="flex items-center justify-between bg-slate-950/20 border border-white/5 rounded-lg p-2 text-[10px] leading-tight">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-slate-300 font-medium truncate" title={part.name}>{part.name}</div>
                      <span className="text-[8px] text-slate-500 font-mono block mt-0.5">{part.part_id} • Crit: {part.criticality}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isOutOfStock ? (
                        <span className="text-[8px] font-black text-red-400 bg-red-950/40 border border-red-500/20 px-1 rounded animate-pulse">OUT</span>
                      ) : isLow ? (
                        <span className="text-[8px] font-black text-amber-400 bg-amber-950/40 border border-amber-500/20 px-1 rounded">LOW</span>
                      ) : null}
                      <span className={`text-[10px] font-mono font-bold ${isOutOfStock ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-slate-400'}`}>
                        Qty: {part.stock}
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[9px] text-slate-600 font-mono text-center py-4">
                No spare parts registered.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Purchase Orders (Roadmap feature) */
        <div className="flex-1 min-h-0 flex flex-col">
          <span className="text-[8px] font-black text-slate-550 uppercase tracking-widest block mb-1.5 font-mono">
            Auto-Generated Order Approvals
          </span>
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
            {purchaseOrders && purchaseOrders.length > 0 ? (
              purchaseOrders.map((order) => {
                const isPending = order.status === 'Pending Approval';
                const isApproved = order.status === 'Approved & Restocked';
                const isRejected = order.status === 'Rejected';
                
                return (
                  <div key={order.order_id} className="bg-slate-950/20 border border-white/5 rounded-lg p-2 flex flex-col gap-1.5 text-[10px]">
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 flex-1 pr-1.5">
                        <div className="text-slate-200 font-black truncate">{order.part_name}</div>
                        <span className="text-[8px] text-slate-550 font-mono block">Order ID: {order.order_id}</span>
                      </div>
                      
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                        isPending ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 
                        isApproved ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                        'text-slate-500 bg-slate-500/10 border-slate-550/20'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                    
                    <p className="text-[8px] text-slate-400 leading-tight italic bg-slate-950/50 p-1 rounded font-sans">
                      {order.trigger_reason}
                    </p>
                    
                    <div className="flex justify-between items-center text-[8px] font-mono text-slate-550 mt-0.5">
                      <span>Qty: {order.quantity} • {order.timestamp}</span>
                      
                      {isPending && (
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRejectOrder(order.order_id)}
                            className="bg-red-500/10 border border-red-500/25 hover:bg-red-500/25 text-red-400 hover:text-white px-2 py-0.5 rounded cursor-pointer transition-all font-mono font-bold"
                          >
                            REJECT
                          </button>
                          <button
                            onClick={() => handleApproveOrder(order.order_id)}
                            className="bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600 text-emerald-400 hover:text-white px-2 py-0.5 rounded cursor-pointer transition-all flex items-center gap-0.5 font-mono font-bold"
                          >
                            <Check className="w-2.5 h-2.5" /> APPROVE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-[9px] text-slate-600 font-mono text-center py-4 flex flex-col items-center justify-center gap-1.5">
                <ShoppingCart className="w-5 h-5 text-slate-700" />
                <span>No purchase orders triggered.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Service Logging Modal */}
      {showLogModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-5 shadow-2xl relative animate-scale-up">
            
            <button
              onClick={() => setShowLogModal(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Wrench className="w-4 h-4 text-blue-400" /> Log Maintenance Activity
            </h3>
            <p className="text-[10px] text-slate-500 font-sans mb-4 leading-relaxed">
              Log a service event for **{selectedMachine.display_name}**. This resets the scheduled maintenance timer and adds this event to the asset's permanent history.
            </p>

            <form onSubmit={handleLogMaintenance} className="space-y-4">
              <div>
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 font-mono">
                  Service Action Performed
                </label>
                <textarea
                  required
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="e.g., Swapped primary intake filter, tensioned drive belt assembly, and calibrated temperature sensor thresholds..."
                  className="w-full bg-slate-950 border border-white/5 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/30 resize-none h-24 transition-all leading-relaxed font-sans"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowLogModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-white/5 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 text-white font-bold py-2 px-4 rounded-xl flex items-center gap-2 transition-colors text-xs"
                >
                  {submitting ? 'Saving...' : 'Save Service Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default React.memo(MaintenanceSchedule);
