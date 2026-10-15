CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"description" text,
	"reference_id" uuid,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "wallets" DROP CONSTRAINT "wallets_owner_type_check";--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "transaction_id" uuid;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "balance_after" bigint;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD COLUMN "iban_encrypted" text;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD COLUMN "iban_hash" text;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD COLUMN "account_holder" text;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD COLUMN "bank_reference" text;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD COLUMN "approved_by" uuid;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD COLUMN "processed_at" timestamp;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_transactions_reference_idx" ON "ledger_transactions" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_created_at_idx" ON "ledger_transactions" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_owner_type_check" CHECK ("wallets"."owner_type" IN ('USER','TREASURY','GATEWAY_CLEARING','WITHDRAWAL_ESCROW','ADJUSTMENT'));