do $$
begin
	if exists (
		select 1
		from pg_constraint c
		join pg_class t on t.oid = c.conrelid
		where t.relname = 'user_app_permissions'
			and c.conname = 'user_app_permissions_app_id_fkey'
	) then
		alter table user_app_permissions
			drop constraint user_app_permissions_app_id_fkey;
	end if;
end $$;
