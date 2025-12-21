# 🎮 Mobile In-App Purchases & Ad Rewards - Backend Implementation

Complete backend implementation for mobile app monetization features including rewarded video ads and in-app purchases with Google Play integration.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Quick Start](#quick-start)
- [API Endpoints](#api-endpoints)
- [Architecture](#architecture)
- [Setup Guide](#setup-guide)
- [Documentation](#documentation)

---

## 🎯 Overview

This implementation adds comprehensive support for:

1. **Rewarded Video Ads** - Users earn credits by watching ads
2. **In-App Purchases** - Users buy credit packages via Google Play/App Store
3. **Credit Management** - Unified system tracking multiple credit types
4. **Purchase Verification** - Server-side verification with Google Play API

### Credit Types

The system now tracks **4 types of credits**:

1. **Ad Credits** - Earned by watching rewarded video ads
2. **Purchased Credits** - Bought via in-app purchases
3. **Addon Credits** - Bought via Stripe on web
4. **Monthly Allowance** - Included with subscription

Credits are consumed in priority order (ad credits first, monthly allowance last) to maximize user value.

---

## ✨ Features

### Ad Rewards System
- ✅ Daily ad limit (20 ads/day, configurable)
- ✅ Cooldown period between ads (5 minutes, configurable)
- ✅ Automatic daily counter reset
- ✅ Configurable credits per ad
- ✅ Real-time balance updates

### In-App Purchase Verification
- ✅ Google Play integration via googleapis
- ✅ Transaction deduplication (prevents double-crediting)
- ✅ Full audit trail in database
- ✅ Support for multiple product tiers
- ✅ iOS ready (stub implemented)
- ✅ Development mode for testing

### Security & Reliability
- ✅ JWT authentication on all endpoints
- ✅ Server-side purchase verification
- ✅ Input validation with DTOs
- ✅ Comprehensive error handling
- ✅ Transaction audit logging
- ✅ Rate limiting ready

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install googleapis
```

### 2. Configure Environment

Add to `.env`:

```bash
# Ad Configuration
MAX_ADS_PER_DAY=20
AD_COOLDOWN_MINUTES=5
CREDITS_PER_AD=5

# Google Play API
GOOGLE_PLAY_SERVICE_ACCOUNT_KEY=/path/to/service-account.json
GOOGLE_PLAY_PACKAGE_NAME=com.bootroombot.app
```

### 3. Run Migration

```bash
npm run migration:run
```

### 4. Start Server

```bash
npm run start:dev
```

---

## 📡 API Endpoints

All endpoints require JWT authentication.

### Ad Rewards

```http
POST /api/v1/ads/reward
Content-Type: application/json
Authorization: Bearer {token}

{
  "creditsEarned": 5
}
```

**Response:**
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

### Purchase Verification

```http
POST /api/v1/purchases/verify-mobile
Content-Type: application/json
Authorization: Bearer {token}

{
  "productId": "credits_50",
  "transactionId": "GPA.1234-5678-9012-34567",
  "platform": "android"
}
```

**Response:**
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

### Credit Balance

```http
GET /api/v1/subscriptions/usage
Authorization: Bearer {token}
```

**Response:**
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

---

## 🏗️ Architecture

### Modules

```
src/
├── ads/                          # Ad rewards module
│   ├── ads.controller.ts         # REST endpoints
│   ├── ads.service.ts            # Business logic
│   ├── ads.module.ts             # Module definition
│   ├── config/                   # Configuration
│   └── dto/                      # Request/response DTOs
│
├── mobile-purchases/             # IAP module
│   ├── mobile-purchases.controller.ts
│   ├── mobile-purchases.service.ts
│   ├── mobile-purchases.module.ts
│   ├── domain/                   # Domain models
│   ├── infrastructure/           # Database layer
│   ├── config/                   # Google Play config
│   └── dto/                      # Request/response DTOs
│
└── prompt-usage/                 # Credit tracking (updated)
    ├── prompt-usage.service.ts   # Enhanced with new credit types
    └── infrastructure/           # Database entities
```

### Database Schema

**mobile_purchases** (new table)
```sql
id              UUID PRIMARY KEY
userId          UUID REFERENCES user(id)
productId       VARCHAR(100)
transactionId   VARCHAR(255) UNIQUE
platform        VARCHAR(20)
creditsGranted  INTEGER
purchaseDate    TIMESTAMP
verifiedAt      TIMESTAMP
rawReceipt      TEXT
```

**prompt_usage** (updated columns)
```sql
adCredits           INTEGER DEFAULT 0
purchasedCredits    INTEGER DEFAULT 0
lastAdWatchedAt     TIMESTAMP
adsWatchedToday     INTEGER DEFAULT 0
adsWatchDate        DATE
```

---

## 📚 Documentation

### For Backend Developers
- **[Installation Steps](./INSTALLATION_STEPS.md)** - Complete setup guide
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - What was built
- **[Full Documentation](./docs/MOBILE_IAP_ADS_SETUP.md)** - Detailed technical docs

### For Mobile Developers
- **[Mobile App Integration Guide](./docs/MOBILE_APP_INTEGRATION.md)** - API usage examples

---

## 🛠️ Setup Guide

### Google Play Configuration

1. **Create Service Account**
   - Go to Google Cloud Console
   - Create service account
   - Download JSON key
   - Enable Google Play Developer API

2. **Link to Play Console**
   - Open Google Play Console
   - Go to Setup → API access
   - Link service account
   - Grant permissions

3. **Create Products**
   - Go to Monetization → In-app products
   - Create: `credits_10` ($2.99)
   - Create: `credits_50` ($9.99)
   - Create: `credits_100` ($17.99)

**Detailed instructions:** See [INSTALLATION_STEPS.md](./INSTALLATION_STEPS.md)

---

## 💳 Product Configuration

| Product ID | Credits | Price | Description |
|------------|---------|-------|-------------|
| `credits_10` | 10 | $2.99 | Starter pack |
| `credits_50` | 50 | $9.99 | Popular choice |
| `credits_100` | 100 | $17.99 | Best value |

Configure these in:
- Google Play Console (backend verification)
- Mobile app (display to users)

---

## 🧪 Testing

### Test Ad Rewards

```bash
curl -X POST http://localhost:3000/api/v1/ads/reward \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"creditsEarned": 5}'
```

### Test Purchase Verification

```bash
curl -X POST http://localhost:3000/api/v1/purchases/verify-mobile \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "credits_50",
    "transactionId": "TEST_TRANSACTION",
    "platform": "android"
  }'
```

### Development Mode

Set `NODE_ENV=development` to bypass Google Play verification (for testing only).

**⚠️ WARNING:** Never use development mode in production!

---

## 🔒 Security

### Implemented Security Features

1. **JWT Authentication** - All endpoints protected
2. **Server-Side Verification** - Never trust client
3. **Transaction Deduplication** - Prevents double-crediting
4. **Rate Limiting** - Daily ad limits enforced
5. **Input Validation** - All requests validated with DTOs
6. **Audit Trail** - All transactions logged

### Best Practices

- ✅ Store service account key securely (not in git)
- ✅ Use HTTPS in production
- ✅ Set proper file permissions (600) on key file
- ✅ Monitor for suspicious activity
- ✅ Regularly rotate API keys
- ✅ Set up alerts for failed verifications

---

## 📊 Credit Consumption Logic

When a user makes a chat request, credits are consumed in this priority order:

```
1. Ad Credits (free)
   ↓
2. Purchased Credits (IAP)
   ↓
3. Addon Credits (Stripe web)
   ↓
4. Monthly Allowance (subscription)
```

This ensures users always get maximum value from their purchases.

---

## 🐛 Troubleshooting

### Common Issues

**"Cannot find module 'googleapis'"**
```bash
npm install googleapis
```

**"Service account not found"**
- Check `GOOGLE_PLAY_SERVICE_ACCOUNT_KEY` path
- Verify file exists and is readable

**"Purchase verification failed"**
- Ensure Google Play Developer API is enabled
- Check service account permissions
- Verify product ID exists in Play Console

**"dailyAdLimitReached"**
- Expected behavior - user watched 20 ads today
- Counter resets at midnight

**"transactionAlreadyProcessed"**
- Expected behavior - prevents double-crediting
- Transaction was already verified

---

## 📈 Monitoring

### Recommended Metrics

- Daily ad rewards granted
- Daily purchases verified
- Failed verification attempts
- Average credits per user
- Revenue from IAP

### Database Queries

```sql
-- Today's ad rewards
SELECT COUNT(*) FROM prompt_usage 
WHERE adsWatchDate = CURRENT_DATE;

-- Recent purchases
SELECT * FROM mobile_purchases 
WHERE createdAt > NOW() - INTERVAL '24 hours'
ORDER BY createdAt DESC;

-- Failed verifications (check logs)
-- Set up alerts for unusual patterns
```

---

## 🎯 Production Checklist

Before deploying to production:

- [ ] Install googleapis package
- [ ] Configure Google Play service account
- [ ] Run database migration
- [ ] Set environment variables
- [ ] Set `NODE_ENV=production`
- [ ] Secure service account JSON key
- [ ] Enable HTTPS/SSL
- [ ] Set up monitoring
- [ ] Test all endpoints
- [ ] Configure rate limiting
- [ ] Set up error alerting

---

## 📞 Support

### For Issues

1. Check [Troubleshooting](#troubleshooting) section
2. Review server logs
3. Verify environment configuration
4. Check Google Play Console setup

### Resources

- [Google Play Developer API Docs](https://developers.google.com/android-publisher)
- [NestJS Documentation](https://docs.nestjs.com/)
- [TypeORM Documentation](https://typeorm.io/)

---

## 🎉 Summary

This implementation provides a complete, production-ready backend for mobile app monetization with:

- ✅ Rewarded video ads with limits and cooldowns
- ✅ In-app purchase verification with Google Play
- ✅ Comprehensive credit tracking system
- ✅ Security best practices
- ✅ Full audit trail
- ✅ Excellent error handling
- ✅ Complete documentation

**Ready to integrate with your mobile app!**

---

## 📄 License

Same as parent project (MIT)

---

## 🤝 Contributing

When contributing to mobile features:

1. Follow existing code structure
2. Add tests for new functionality
3. Update documentation
4. Ensure security best practices
5. Test with real Google Play transactions

---

**Built with ❤️ for BootroomBot**

