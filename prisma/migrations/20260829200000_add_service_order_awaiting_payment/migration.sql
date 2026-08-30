-- Cobranca em aberto: a OS finalizada em que o cliente abandonou o checkout do
-- gateway fica retida neste status ate o pagamento entrar. E um estado entre
-- COMPLETED e DELIVERED, por isso entra antes de DELIVERED na ordem do enum.
ALTER TYPE "ServiceOrderStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'DELIVERED';
