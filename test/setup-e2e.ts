process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
process.env.JWT_REFRESH_TTL = '7d';

process.env.STRIPE_SECRET_KEY = 'sk_test_e2e';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e';
process.env.PAYMENT_SUCCESS_URL = 'http://localhost:3000/payment/success';
process.env.PAYMENT_CANCEL_URL = 'http://localhost:3000/payment/cancel';
