alter table invites
	add column if not exists initial_app_id text,
	add column if not exists redirect_to text;
