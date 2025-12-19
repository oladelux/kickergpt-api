# Mobile App Integration Guide

Quick reference for mobile app developers integrating with the backend API.

## 🔐 Authentication

All endpoints require JWT authentication. Include the token in the Authorization header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📱 API Endpoints

Base URL: `https://your-api.com/api/v1`

### 1. Watch Ad & Get Reward

**Endpoint:** `POST /ads/reward`

**When to call:** After user successfully watches a rewarded video ad

**Request:**
```json
{
  "creditsEarned": 5
}
```

**Success Response (200):**
```json
{
  "success": true,
  "creditsGranted": 5,
  "newBalance": {
    "adCreditsRemaining": 25,
    "totalCreditsRemaining": 125
  },
  "nextAdAvailable": "2025-12-19T15:30:00Z"
}
```

**Error Responses:**

**Daily Limit Reached (403):**
```json
{
  "statusCode": 403,
  "message": "dailyAdLimitReached",
  "maxAdsPerDay": 20
}
```

**Cooldown Active (403):**
```json
{
  "statusCode": 403,
  "message": "adCooldownActive",
  "nextAdAvailable": "2025-12-19T15:30:00Z",
  "cooldownMinutes": 5
}
```

**Invalid Credits (400):**
```json
{
  "statusCode": 400,
  "message": "Invalid credits amount. Expected 5, got 10"
}
```

---

### 2. Verify In-App Purchase

**Endpoint:** `POST /purchases/verify-mobile`

**When to call:** After user completes an in-app purchase

**Request:**
```json
{
  "productId": "credits_50",
  "transactionId": "GPA.1234-5678-9012-34567",
  "platform": "android"
}
```

**Fields:**
- `productId`: One of `credits_10`, `credits_50`, `credits_100`
- `transactionId`: The purchase token from Google Play or App Store
- `platform`: Either `"android"` or `"ios"`

**Success Response (200):**
```json
{
  "success": true,
  "creditsGranted": 50,
  "transactionId": "GPA.1234-5678-9012-34567",
  "newBalance": {
    "purchasedCreditsRemaining": 50,
    "totalCreditsRemaining": 150
  }
}
```

**Error Responses:**

**Already Processed (409):**
```json
{
  "statusCode": 409,
  "message": "transactionAlreadyProcessed",
  "transactionId": "GPA.1234-5678-9012-34567"
}
```

**Invalid Product (400):**
```json
{
  "statusCode": 400,
  "message": "invalidProductId",
  "productId": "invalid_product"
}
```

**Verification Failed (400):**
```json
{
  "statusCode": 400,
  "message": "purchaseVerificationFailed",
  "error": "Purchase not found or invalid"
}
```

---

### 3. Restore Purchases

**Endpoint:** `POST /purchases/sync`

**When to call:** When user taps "Restore Purchases" button

**Request:**
```json
{}
```

**Success Response (200):**
```json
{
  "success": true,
  "purchasesSynced": 2,
  "creditsAdded": 60
}
```

---

### 4. Get Credit Balance

**Endpoint:** `GET /subscriptions/usage`

**When to call:** 
- On app launch
- After any credit transaction
- When displaying credit balance to user

**Response (200):**
```json
{
  "monthlyAllowance": 100,
  "monthlyUsed": 25,
  "monthlyRemaining": 75,
  "addonCreditsRemaining": 10,
  "adCreditsRemaining": 15,
  "purchasedCreditsRemaining": 50,
  "totalCreditsRemaining": 150
}
```

**Display to user:** Show `totalCreditsRemaining` as the main balance

---

## 🎮 User Flow Examples

### Ad Watching Flow

```typescript
// 1. Check if user can watch ad
async function canWatchAd(): Promise<boolean> {
  const usage = await getUsage();
  // Check if nextAdAvailable is in the past or null
  if (usage.nextAdAvailable && new Date(usage.nextAdAvailable) > new Date()) {
    return false;
  }
  return true;
}

// 2. User watches ad
async function onAdCompleted() {
  try {
    const response = await fetch('/api/v1/ads/reward', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ creditsEarned: 5 })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Show success message
      showToast(`You earned ${data.creditsGranted} credits!`);
      updateBalance(data.newBalance.totalCreditsRemaining);
      
      // Store next available time
      if (data.nextAdAvailable) {
        localStorage.setItem('nextAdAvailable', data.nextAdAvailable);
      }
    } else {
      handleAdError(data);
    }
  } catch (error) {
    showToast('Failed to grant ad reward. Please try again.');
  }
}

// 3. Handle errors
function handleAdError(error: any) {
  if (error.message === 'dailyAdLimitReached') {
    showToast('You\'ve reached your daily ad limit. Come back tomorrow!');
  } else if (error.message === 'adCooldownActive') {
    const nextTime = new Date(error.nextAdAvailable);
    showToast(`Please wait ${error.cooldownMinutes} minutes before watching another ad.`);
  }
}
```

### In-App Purchase Flow

```typescript
// 1. User initiates purchase
async function purchaseCredits(productId: string) {
  try {
    // Use your IAP library (e.g., react-native-iap)
    const purchase = await requestPurchase(productId);
    
    // 2. Verify with backend
    const response = await fetch('/api/v1/purchases/verify-mobile', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        productId: productId,
        transactionId: purchase.transactionId,
        platform: Platform.OS // 'android' or 'ios'
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Success! Credits granted
      showToast(`${data.creditsGranted} credits added to your account!`);
      updateBalance(data.newBalance.totalCreditsRemaining);
      
      // Finish transaction (important!)
      await finishTransaction(purchase);
    } else if (response.status === 409) {
      // Already processed - this is OK
      showToast('Purchase already processed');
      await finishTransaction(purchase);
    } else {
      // Verification failed
      showToast('Purchase verification failed. Please contact support.');
      // Don't finish transaction - user can retry
    }
  } catch (error) {
    showToast('Purchase failed. Please try again.');
  }
}

// 3. Restore purchases
async function restorePurchases() {
  showLoading('Restoring purchases...');
  
  try {
    const response = await fetch('/api/v1/purchases/sync', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    const data = await response.json();
    
    if (data.creditsAdded > 0) {
      showToast(`${data.creditsAdded} credits restored!`);
    } else {
      showToast('No purchases to restore');
    }
    
    // Refresh balance
    await refreshBalance();
  } catch (error) {
    showToast('Failed to restore purchases');
  } finally {
    hideLoading();
  }
}
```

---

## 💰 Product IDs & Pricing

Configure these in your app:

| Product ID | Credits | Suggested Price |
|------------|---------|-----------------|
| `credits_10` | 10 | $2.99 |
| `credits_50` | 50 | $9.99 |
| `credits_100` | 100 | $17.99 |

---

## 🎯 Best Practices

### 1. Always Verify Purchases
Never trust client-side purchase validation. Always verify with backend.

### 2. Handle Errors Gracefully
```typescript
if (error.message === 'transactionAlreadyProcessed') {
  // This is OK - finish the transaction
  await finishTransaction(purchase);
}
```

### 3. Update Balance After Every Transaction
```typescript
async function refreshBalance() {
  const usage = await fetch('/api/v1/subscriptions/usage');
  updateUI(usage.totalCreditsRemaining);
}
```

### 4. Store Ad Cooldown Locally
```typescript
// Check locally before showing ad button
const nextAdTime = localStorage.getItem('nextAdAvailable');
if (nextAdTime && new Date(nextAdTime) > new Date()) {
  disableAdButton();
}
```

### 5. Show Clear Feedback
```typescript
// Good
showToast('You earned 5 credits! 🎉');

// Bad
showToast('Success');
```

---

## 🐛 Common Issues

### Issue: "transactionAlreadyProcessed"
**Cause:** Transaction was already verified
**Solution:** This is expected. Finish the transaction and move on.

### Issue: "dailyAdLimitReached"
**Cause:** User watched 20 ads today
**Solution:** Show message and disable ad button until tomorrow

### Issue: "adCooldownActive"
**Cause:** User watched an ad less than 5 minutes ago
**Solution:** Show countdown timer until next ad is available

### Issue: "purchaseVerificationFailed"
**Cause:** Google Play couldn't verify the purchase
**Solution:** 
1. Check internet connection
2. Ensure product ID is correct
3. Verify Google Play setup
4. Contact support if persists

---

## 📊 Testing

### Test Ad Rewards
1. Watch an ad
2. Call `/ads/reward` endpoint
3. Verify credits are added
4. Try watching another ad immediately (should fail with cooldown)
5. Try watching 21 ads in one day (should fail with daily limit)

### Test In-App Purchases
1. Use Google Play test account
2. Make a test purchase
3. Verify credits are added
4. Try to verify same transaction again (should fail with 409)
5. Test restore purchases

### Test Credit Balance
1. Make various transactions
2. Check balance updates correctly
3. Verify `totalCreditsRemaining` is sum of all credit types

---

## 🔗 Related Documentation

- [Backend Setup Guide](../INSTALLATION_STEPS.md)
- [Full API Documentation](./MOBILE_IAP_ADS_SETUP.md)
- [Implementation Summary](../IMPLEMENTATION_SUMMARY.md)

---

## 📞 Support

For backend issues:
- Check server logs
- Verify environment variables
- Ensure Google Play API is set up correctly

For mobile integration issues:
- Verify JWT token is valid
- Check request/response format
- Ensure product IDs match backend configuration

