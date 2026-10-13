import { supabase } from './supabase'

// Auth del panel /admin. Comparte el pool de usuarios de Supabase con Akira y
// faroles, pero el permiso es EXPLICITO: el usuario tiene que estar en
// `embrujada.admins`. Ser admin de otra app no da acceso aca.

export type SignInResult = { ok: true } | { ok: false; error: string }

// Inicia sesion y verifica que sea admin de la casa. Si no lo es, cierra sesion
// para no dejar una sesion valida sin permisos.
export async function signInAdmin(email: string, password: string): Promise<SignInResult> {
  const sb = supabase()
  const { error } = await sb.auth.signInWithPassword({ email, password })
  if (error) return { ok: false, error: error.message }
  const check = await adminCheck()
  if (!check.ok) await sb.auth.signOut()
  return check
}

export async function signOutAdmin(): Promise<void> {
  await supabase().auth.signOut()
}

// Verifica que la sesion activa este en embrujada.admins. Distingue "no es
// admin" de "el schema no esta expuesto en la API" para no confundir un
// problema de configuracion con un problema de permisos.
async function adminCheck(): Promise<SignInResult> {
  const sb = supabase()
  const { data: userRes } = await sb.auth.getUser()
  if (!userRes.user) return { ok: false, error: 'No hay sesion activa.' }
  // RLS de embrujada.admins solo deja ver la propia fila: si vuelve una, es admin.
  const { data, error } = await sb.from('admins').select('user_id').limit(1)
  if (error) {
    if (error.code === 'PGRST106') {
      return {
        ok: false,
        error: 'Falta exponer el schema `embrujada` en Supabase > Project Settings > API > Exposed schemas.',
      }
    }
    return { ok: false, error: error.message }
  }
  if ((data?.length ?? 0) === 0) return { ok: false, error: 'Esta cuenta no es admin de la Casa Embrujada.' }
  return { ok: true }
}

// True si hay sesion activa Y el usuario esta en embrujada.admins.
export async function isHouseAdmin(): Promise<boolean> {
  return (await adminCheck()).ok
}
