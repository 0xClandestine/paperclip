CREATE TABLE "eval_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"repo_url" text NOT NULL,
	"eval_path" text NOT NULL,
	"baseline_ref" text,
	"direction" text DEFAULT 'lower' NOT NULL,
	"score_unit" text,
	"timeout_ms" integer DEFAULT 300000 NOT NULL,
	"best_score" double precision,
	"best_run_id" uuid,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eval_configs_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_config_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"heartbeat_run_id" uuid,
	"commit_hash" text,
	"score" double precision,
	"raw_output" text,
	"raw_stderr" text,
	"exit_code" integer,
	"duration_ms" integer,
	"baseline_ref" text,
	"disposition" text DEFAULT 'keep' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_eval_config_id_eval_configs_id_fk" FOREIGN KEY ("eval_config_id") REFERENCES "public"."eval_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_runs_config_issue_idx" ON "eval_runs" USING btree ("eval_config_id","issue_id");--> statement-breakpoint
CREATE INDEX "eval_runs_config_created_idx" ON "eval_runs" USING btree ("eval_config_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_title_search_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_latest_body_search_idx" ON "documents" USING gin ("latest_body" gin_trgm_ops);