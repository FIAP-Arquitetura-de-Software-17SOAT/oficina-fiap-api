-- Aviso ao cliente a cada mudança de status da ordem de serviço.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SERVICE_ORDER_STATUS_CHANGED';
