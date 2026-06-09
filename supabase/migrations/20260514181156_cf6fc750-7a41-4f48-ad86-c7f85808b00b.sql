GRANT EXECUTE ON FUNCTION public.user_belongs_to_hospital(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_hospital_role(uuid, uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_user_hospital_id(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, anon;