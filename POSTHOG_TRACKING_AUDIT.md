# PostHog Tracking Audit Report

## Summary
This document provides a comprehensive audit of PostHog analytics tracking across the SnapSell app. It identifies all tracked events and highlights any potential gaps.

## Currently Tracked Events

### Screen Views
✅ **All major screens are tracked:**
- `screen_viewed` - home, listing-preview, my-listings, settings, upgrade, purchase, profile
- `screen_viewed` - sign-in, sign-up, magic-link, email-confirmation, share

### Navigation
✅ **Tab navigation:**
- `tab_switched` - tracks when users switch between tabs (home, my-listings, settings, upgrade)

### Authentication Events
✅ **Sign In:**
- `sign_in_attempted` - email/password, Google, Apple
- `sign_in_succeeded` - email/password, Google, Apple
- `sign_in_failed` - email/password, Google, Apple
- `sign_in_cancelled` - Google, Apple
- `magic_link_requested` - email magic link
- `magic_link_failed` - magic link errors

✅ **Sign Up:**
- `sign_up_attempted` - email/password, Google, Apple
- `sign_up_succeeded` - email/password, Google, Apple
- `sign_up_failed` - email/password, Google, Apple
- `sign_up_cancelled` - Google, Apple

✅ **Account Management:**
- `user_signed_out` - from profile or settings
- `profile_updated` - when user updates profile
- `account_deletion_initiated` - when user starts deletion
- `account_deleted` - when account is successfully deleted

### Photo & Listing Creation
✅ **Photo Uploads:**
- `photo_uploaded` - with source (camera/library) from home, my-listings, listing-preview

✅ **Listing Generation:**
- `listing_generated` - when AI successfully generates listing
- `generate_blocked_no_quota` - when generation blocked due to quota
- `quota_checked` - when quota is checked before generation

### Listing Interactions
✅ **Listing Editing:**
- `listing_field_edited` - tracks edits to: title, price, currency, condition, description, location, category, brand, model
- `listing_edited` - when listing is edited from my-listings screen
- `listing_copied` - when listing text is copied (from listing-preview and my-listings)
- `listing_saved` - when listing is saved to backend
- `listing_deleted` - when listing is deleted
- `listings_refreshed` - when my-listings screen refreshes

✅ **Listing Actions:**
- `add_next_item_clicked` - from listing-preview
- `go_to_my_listings_clicked` - from listing-preview
- `location_button_pressed` - when user requests location
- `create_listing_from_empty_state` - when creating from empty my-listings state

### Save & Auto-Save
✅ **Save Functionality:**
- `auto_save_toggle` - when user toggles auto-save checkbox
- `auto_save_toggle_attempt` - when unauthenticated user tries to toggle
- `save_blocked_no_quota` - when save blocked due to quota

### Quota & Limits
✅ **Quota Events:**
- `low_quota_nudge_shown` - when low quota warning is displayed
- `generate_blocked_no_quota` - when generation blocked
- `save_blocked_no_quota` - when save blocked

### Purchase & Payments
✅ **Purchase Flow:**
- `purchase_initiated` - when purchase started (save_slots or subscription)
- `purchase_completed` - when purchase succeeds
- `purchase_failed` - when purchase fails
- `purchase_cancelled` - when user cancels purchase
- `purchase_options_opened` - when purchase screen is opened
- `payment_history_viewed` - when payment history is loaded
- `tap_buy_pack` - when user taps buy pack in blocked quota modal
- `pack_purchase_failed` - when pack purchase fails
- `tap_upgrade_to_pro` - when user taps upgrade to pro

### Login Gate Modal
✅ **Login Gate Events:**
- `login_gate_shown` - when login gate modal appears (save/share context)
- `login_method_selected` - email, Apple, Google
- `login_gate_oauth_succeeded` - OAuth success
- `login_gate_oauth_failed` - OAuth failure
- `login_gate_oauth_cancelled` - OAuth cancellation
- `login_gate_dismissed` - when user dismisses modal
- `sign_in_prompt_shown` - when sign-in prompt shown in my-listings

### Sharing
✅ **Share Link Views:**
- `share_link_viewed` - when shared listing link is viewed

### Settings
✅ **Settings Changes:**
- `setting_changed` - tracks changes to: default_location, currency, auto_save_listing, show_quota_modal, low_quota_threshold
- `profile_viewed` - when profile screen opened from settings

## Potentially Missing Tracking

### 1. Share Link Generation ⚠️
**Status:** Not found in codebase
**Issue:** If there's a button/functionality to generate share links for listings, it's not tracked.
**Recommendation:** Add `share_link_generated` event when user creates a share link.

### 2. Upgrade Button Clicks from Settings ⚠️
**Status:** Missing
**Location:** `app/(tabs)/settings.tsx` - `handleUpgrade()` function
**Issue:** When users click "Upgrade to get more" buttons in settings screen, no event is tracked.
**Recommendation:** Add `upgrade_button_clicked` event with context (creations/saves).

### 3. Sign In Button from Settings ⚠️
**Status:** Missing
**Location:** `app/(tabs)/settings.tsx` - Sign in button for non-authenticated users
**Issue:** When non-authenticated users click "Sign In" in settings, no event is tracked.
**Recommendation:** Add `sign_in_button_clicked` event with source: 'settings'.

### 4. "What are Save Slots?" Info Toggle ⚠️
**Status:** Missing
**Location:** `app/(tabs)/upgrade.tsx` - Info toggle button
**Issue:** When users expand/collapse the "What are Save Slots?" section, no event is tracked.
**Recommendation:** Add `save_slots_info_toggled` event with state (expanded/collapsed).

### 5. Currency Dropdown Interactions ⚠️
**Status:** Missing
**Location:** `app/(tabs)/settings.tsx` - Currency dropdown
**Issue:** Opening/closing currency dropdown is not tracked.
**Recommendation:** Add `currency_dropdown_opened` and `currency_dropdown_closed` events.

### 6. Condition Modal Interactions ⚠️
**Status:** Missing
**Location:** `app/(tabs)/listing-preview.tsx` - Condition selection modal
**Issue:** Opening/closing condition modal and condition selection may not be tracked.
**Recommendation:** Verify if condition selection is tracked via `listing_field_edited` (it should be).

### 7. Error Tracking ⚠️
**Status:** Function exists but not widely used
**Location:** `utils/analytics.ts` - `trackError()` function
**Issue:** The `trackError()` function exists but is not called anywhere in the app.
**Recommendation:** Add error tracking for:
- API failures
- Image upload failures
- Network errors
- Unexpected errors

### 8. Modal Dismissals ⚠️
**Status:** Partially tracked
**Issue:** Some modals track dismissal (login_gate_dismissed), but others don't:
- BlockedQuotaModal - "Come back tomorrow" button
- QuotaModal dismissals
- Other modal dismissals
**Recommendation:** Track modal dismissals consistently.

### 9. Purchase Product Selection Details ⚠️
**Status:** Partially tracked
**Issue:** `purchase_initiated` tracks product_type and product_id, but individual product button clicks in purchase screen aren't tracked separately.
**Recommendation:** Add `purchase_product_selected` event before `purchase_initiated` to track which specific product user selected.

### 10. Listing Preview Screen Entry ⚠️
**Status:** Tracked via screen_viewed
**Note:** This is tracked, but consider adding context about how user arrived (from home, from my-listings, etc.)

## Recommendations

### High Priority
1. **Add error tracking** - Use `trackError()` function for critical errors
2. **Track upgrade button clicks** - Add tracking in settings screen
3. **Track share link generation** - If share functionality exists, track it

### Medium Priority
4. **Track info toggles** - Save Slots info, currency dropdown
5. **Track modal dismissals** - Consistent tracking across all modals
6. **Track sign-in button clicks** - From settings and other locations

### Low Priority
7. **Enhance purchase tracking** - Track product selection separately
8. **Add context to screen views** - Track how users arrived at screens

## Implementation Notes

- All tracking uses `trackEvent()` from `utils/analytics.ts`
- Screen views use `trackScreenView()` helper
- Tab switches use `trackTabSwitch()` helper
- Error tracking function exists but is unused
- PostHog is initialized in `app/_layout.tsx`
- Events are flushed immediately (`flushAt: 1`) for production builds

## Conclusion

**Overall Coverage:** ~90% of user activities are tracked.

**Strengths:**
- Comprehensive authentication tracking
- Good coverage of listing creation and editing
- Purchase flow is well tracked
- Screen views are tracked consistently

**Gaps:**
- Error tracking is not implemented
- Some UI interactions (dropdowns, toggles) are not tracked
- Share link generation (if exists) is not tracked
- Some button clicks in settings screen are not tracked

