
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.has_hospital_role(uuid, uuid, app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_hospital(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_hospital_id(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_updated_at() FROM public, anon, authenticated;
