# CardLedger Upgrade Roadmap

## Executive Summary

As a 20+ year veteran engineer analyzing CardLedger, I see a **well-architected system** with clean separation of concerns, server-authoritative calculations, and solid MVVM implementation. However, three key areas need enhancement to reach production-grade maturity:

1. **Notification Infrastructure** (High Priority)
2. **Billing Cycle Snapshots** (Medium Priority)  
3. **Usage Display Bug** (Quick Win)

---

## 🎯 Three-Phase Upgrade Strategy

### Phase 1: Persistent Notification System 🔔
**Priority**: HIGH  
**Effort**: ~5 days  
**Impact**: Enables web/email alerts, survives app uninstall, conditional reminders

**Solves:**
- ✅ Alert for billing date (only if cycle has usage)
- ✅ Alert for due date (only if bill unpaid)
- ✅ Cross-platform reminders (Android, web, email)
- ✅ Reminder history and snooze

**New Tables:**
- `reminders` - Persistent notification records
- `notification_preferences` - Per-card or global settings

**Background Jobs:**
- Reminder Scheduler (daily) - Creates reminders for upcoming dates
- Reminder Dispatcher (every 15 min) - Fires due reminders

**Android Changes:**
- Remove AlarmManager-based scheduling
- Integrate Firebase Cloud Messaging (FCM)
- Sync preferences with server

**📄 Full Spec**: [upgrade-proposal-notifications.md](./upgrade-proposal-notifications.md)

---

### Phase 2: Billing Cycle Snapshots 📸
**Priority**: MEDIUM  
**Effort**: ~7.5 days  
**Impact**: Historical accuracy, bill verification, better analytics

**Solves:**
- ✅ Cycle-based usage tracking with snapshots
- ✅ Historical bill amounts don't change when transactions edited
- ✅ Track which bill was paid when
- ✅ Auto-detect overdue payments
- ✅ Project next bill before statement arrives

**New Tables:**
- `billing_cycles` - Snapshot per cycle with status (projected, generated, paid, overdue)
- Links: `transactions.billing_cycle_id`, `card_payments.billing_cycle_id`

**Cycle Lifecycle:**
```
[PROJECTED] → [GENERATED] → [PAID] / [OVERDUE]
    ↓              ↓              ↓
  Editable    Semi-locked    Locked
```

**Background Job:**
- Cycle Manager (daily) - Creates projected cycles, auto-closes past cycles, marks overdue

**Android Changes:**
- Cycle status badges in card detail
- New BillingCyclesScreen to list all cycles
- Warn when editing generated cycles
- Show bill vs. paid progress bars

**📄 Full Spec**: [upgrade-proposal-cycle-snapshots.md](./upgrade-proposal-cycle-snapshots.md)

---

### Phase 3: Fix Usage Display Bug 🐛
**Priority**: QUICK WIN  
**Effort**: ~1 day  
**Impact**: Correct card usage shown (all holders, not just friends)

**Current Issue:**
- FlipkartAxis shows Usage: ₹53,736 (wrong)
- Should show Usage: ₹58,736 (friend ₹58,117 + me ₹619)

**Root Cause:**
- API only returns `friendUsage`, not `totalCardUsage`
- Android UI displays `friendUsage` where it should show all unpaid

**Solution:**
- Add `totalCardUsage` field to `CardDetailResult`
- Compute as sum of ALL unpaid transactions (all holders)
- Handle shared limit cards (combine usage across linked cards)

**No Schema Changes** - Pure calculation fix

**📄 Full Spec**: [upgrade-proposal-usage-fix.md](./upgrade-proposal-usage-fix.md)

---

## 🚀 Recommended Implementation Order

### Sprint 1: Quick Win + Foundation
**Week 1**: Phase 3 (Usage Fix) ✅ Ship immediately
**Week 2-3**: Phase 1 Part A (Schema + Server APIs)

### Sprint 2: Notifications Complete
**Week 4-5**: Phase 1 Part B (Background jobs + Android FCM)
**Week 6**: Testing + Production rollout

### Sprint 3-4: Cycle Snapshots (Optional, if validated)
**Week 7-9**: Phase 2 (Full cycle snapshot system)
**Week 10**: Backfill historical data + Testing

---

## 📊 Comparison Matrix

| Feature | Current State | After Phase 1 | After Phase 2 |
|---------|---------------|---------------|---------------|
| **Usage Display** | ❌ Friend-only | ✅ All holders | ✅ All holders |
| **Reminders** | ⚠️ Android-only (AlarmManager) | ✅ Server-managed, cross-platform | ✅ Server-managed |
| **Conditional Alerts** | ❌ Always fires | ✅ "Only if usage" | ✅ "Only if usage" |
| **Reminder History** | ❌ None | ✅ Fired/dismissed tracking | ✅ Full history |
| **Email Alerts** | ❌ No | ✅ Yes | ✅ Yes |
| **Overdue Detection** | ⚠️ Manual | ✅ Automatic | ✅ Cycle-based |
| **Historical Bills** | ❌ Recomputed | ❌ Recomputed | ✅ Snapshot |
| **Bill Verification** | ⚠️ Manual | ⚠️ Manual | ✅ Compare to snapshot |
| **Cycle Lock** | ❌ No | ❌ No | ✅ Prevent edits |
| **Projected Bills** | ⚠️ Current only | ⚠️ Current only | ✅ Next 3 months |

---

## 🛠️ Migration Strategy

### Phase 1 Migration
```sql
-- Add new tables
CREATE TABLE reminders (...);
CREATE TABLE notification_preferences (...);

-- Android app one-time sync
-- Push local AlarmManager preferences to server
-- Server takes over scheduling
```

### Phase 2 Migration
```sql
-- Add new table
CREATE TABLE billing_cycles (...);

-- Backfill historical cycles (compute-heavy, run overnight)
INSERT INTO billing_cycles SELECT ... FROM cards;

-- Link existing transactions
UPDATE transactions SET billing_cycle_id = ...;
UPDATE card_payments SET billing_cycle_id = ...;
```

### Phase 3 Migration
**No migration needed** - calculation fix only.

---

## 💰 Cost-Benefit Analysis

### Phase 1 Benefits
- 🎯 **User Satisfaction**: Never miss a payment (email + push redundancy)
- 📈 **Retention**: Reminders bring users back to app
- 🌐 **Web Parity**: Web users get same alerts as Android
- 📊 **Analytics**: Track which reminders drive payment behavior

**Cost**: ~40 hours development + Firebase Cloud Messaging free tier

**ROI**: HIGH - Core feature parity with commercial credit card apps

### Phase 2 Benefits
- 📸 **Audit Trail**: See past bills even after editing transactions
- 🎯 **Dispute Resolution**: "What did bank charge me in September?"
- 📊 **Forecasting**: Better projections with historical patterns
- 🔒 **Data Integrity**: Lock cycles to prevent accidental changes

**Cost**: ~60 hours development + backfill migration

**ROI**: MEDIUM - Nice-to-have for power users, less critical than Phase 1

### Phase 3 Benefits
- ✅ **Correctness**: Fix user-reported bug immediately
- 🚀 **Trust**: Accurate numbers build confidence in app

**Cost**: ~8 hours development

**ROI**: VERY HIGH - Bug fix is table stakes

---

## 🧪 Testing Strategy

### Phase 1 Testing
- [ ] Reminder fires at correct time (time zone handling)
- [ ] Conditional logic: no reminder if no usage
- [ ] Multi-card: separate reminders per card
- [ ] Snooze: reminder reappears at snoozed time
- [ ] Email delivery (test with real SMTP)
- [ ] FCM push delivery on Android
- [ ] Preference changes sync correctly

### Phase 2 Testing
- [ ] Cycle auto-closes on statement date
- [ ] Editing transaction in locked cycle is blocked
- [ ] Historical amounts don't change when new transactions added
- [ ] Overdue status triggers automatically
- [ ] Backfill migration produces correct historical cycles
- [ ] Payment links to correct cycle

### Phase 3 Testing
- [ ] Single card, single holder: usage = unpaid
- [ ] Single card, multi-holder: usage = sum of unpaid
- [ ] Shared limit cards: usage = combined
- [ ] Refunds correctly reduce usage
- [ ] Card payments don't reduce usage (but do reduce toCollect)

---

## 🔮 Future Enhancements (Beyond 3 Phases)

### Payment Autopay Detection
- Scrape bank SMS for "autopay deducted"
- Automatically create bill_payment transaction

### Statement OCR
- Extract bill amount, due date from uploaded PDF
- Pre-fill cycle close form

### Smart Due Date Prediction
- Learn user's typical payment day (e.g., always pays 2 days early)
- Adjust reminder timing accordingly

### Interest Calculator
- If bill not paid in full, show projected interest
- Alert: "Paying ₹X will save ₹Y in interest"

### Credit Utilization Optimizer
- Recommend which cards to pay first for best CIBIL score
- "Paying ₹5k on SimplyClick will reduce utilization by 8%"

### Multi-Currency Support
- Track forex fees per transaction
- Show "effective rate" vs. interbank rate

---

## 📝 Decision Log

### Why Server-Managed Reminders?
**Decision**: Move from Android AlarmManager to server-based scheduling

**Rationale:**
- ✅ Cross-platform (web, iOS future)
- ✅ Survives app uninstall
- ✅ Easier to add email/SMS channels
- ✅ Centralized preference management

**Trade-off**: Adds server complexity, requires background jobs

### Why Cycle Snapshots?
**Decision**: Add `billing_cycles` table with snapshot amounts

**Rationale:**
- ✅ Historical accuracy (editing transactions doesn't change past bills)
- ✅ Enables lock protection
- ✅ Better analytics and forecasting

**Trade-off**: Dual source of truth (snapshot vs. computed), migration complexity

**Alternative Considered**: Event sourcing (store immutable transaction log)
- **Rejected**: Too complex for this use case

### Why Fix Usage Bug Separately?
**Decision**: Quick win before larger infrastructure work

**Rationale:**
- ✅ User-reported bug, high visibility
- ✅ Fast to implement (~1 day)
- ✅ Builds user trust while Phase 1 is in progress

---

## 🤝 Stakeholder Communication

### For Product Team
"We're building a world-class notification system that puts CardLedger on par with commercial credit card apps. Users will never miss a payment again, and we'll have full visibility into reminder effectiveness."

### For Users
"Coming soon:
- 📧 Email reminders (never miss a payment even if your phone is off)
- 🔔 Smart alerts (only notify when there's a bill to pay)
- 📊 Bill history (see past statements even after editing)"

### For Investors/Stakeholders
"These upgrades address the #1 user request (better reminders) while laying the foundation for advanced features like predictive analytics and bill optimization."

---

## 📞 Support & Rollout

### Phase 1 Rollout
1. **Week 1**: Deploy schema changes + server APIs (no UI impact yet)
2. **Week 2**: Android app update with FCM (prompt users to enable notifications)
3. **Week 3**: Enable email reminders for opted-in users
4. **Week 4**: Monitor reminder delivery rates, tune thresholds

### Rollback Plan
- Phase 1: Fall back to Android AlarmManager (old code stays dormant)
- Phase 2: Cycles table is additive, can be dropped without data loss
- Phase 3: Revert shared package, redeploy server

### Monitoring
- **Reminder Dispatcher**: Track success/failure rates per channel (push/email)
- **Cycle Manager**: Alert if backfill takes >1 hour (performance issue)
- **Usage Calculation**: Compare old vs. new values for 1 week (validation)

---

## ✅ Acceptance Criteria

### Phase 1 Complete When:
- [ ] User can configure reminder preferences via settings screen
- [ ] Server creates reminders automatically for upcoming bills
- [ ] Reminders fire via push AND email
- [ ] "Only remind if usage" logic works correctly
- [ ] Reminder history visible in app
- [ ] Zero AlarmManager entries after migration

### Phase 2 Complete When:
- [ ] All cards have projected cycles for next 3 months
- [ ] Historical cycles backfilled (at least 12 months)
- [ ] User can close a cycle and confirm bill amount
- [ ] Locked cycles prevent transaction edits
- [ ] Overdue cycles show in dashboard
- [ ] Transaction edits show warning if cycle is 'generated'

### Phase 3 Complete When:
- [ ] FlipkartAxis usage shows ₹58,736 (not ₹53,736)
- [ ] Shared limit cards show combined usage
- [ ] All test cases pass
- [ ] Deployed to production + verified with real user data

---

## 📚 References

- [upgrade-proposal-notifications.md](./upgrade-proposal-notifications.md) - Full Phase 1 spec
- [upgrade-proposal-cycle-snapshots.md](./upgrade-proposal-cycle-snapshots.md) - Full Phase 2 spec
- [upgrade-proposal-usage-fix.md](./upgrade-proposal-usage-fix.md) - Full Phase 3 spec
- [Drizzle ORM Migrations](https://orm.drizzle.team/docs/migrations) - Migration docs
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging) - Android push docs

---

**Document Version**: 1.0  
**Last Updated**: 2026-09-28  
**Author**: Claude (Senior Engineering Advisor)  
**Review Status**: Pending approval from @im-vj
