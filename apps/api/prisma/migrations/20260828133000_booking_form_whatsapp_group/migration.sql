-- One WhatsApp group link per booking form (grade), not per teacher
ALTER TABLE "BookingForm" ADD COLUMN "whatsappGroupLink" TEXT;

ALTER TABLE "BookingOffering" DROP COLUMN IF EXISTS "whatsappGroupLink";
