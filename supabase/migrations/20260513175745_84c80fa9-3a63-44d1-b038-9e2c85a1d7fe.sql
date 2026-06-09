
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_hospital_role(uuid, uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_hospital(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_hospital_id(uuid) FROM authenticated;
