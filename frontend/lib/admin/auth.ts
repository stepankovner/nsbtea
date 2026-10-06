import { adminApi, must } from "./client";

export const adminAuth = {
  me: () => must(adminApi.GET("/api/admin/auth/me")),
  login: (email: string, password: string) =>
    must(adminApi.POST("/api/admin/auth/login", { body: { email, password } })),
  twoFactor: (challengeId: string, code: string) =>
    must(adminApi.POST("/api/admin/auth/2fa", { body: { challenge_id: challengeId, code } })),
  logout: () => must(adminApi.POST("/api/admin/auth/logout")),
  forgot: (email: string) => must(adminApi.POST("/api/admin/auth/password/forgot", { body: { email } })),
  reset: (email: string, code: string, newPassword: string) =>
    must(adminApi.POST("/api/admin/auth/password/reset", { body: { email, code, new_password: newPassword } })),
  changePassword: (current: string, next: string) =>
    must(adminApi.POST("/api/admin/auth/password/change", { body: { current_password: current, new_password: next } })),
  invite: (token: string) =>
    must(adminApi.GET("/api/admin/auth/invite/{token}", { params: { path: { token } } })),
  acceptInvite: (token: string, password: string) =>
    must(adminApi.POST("/api/admin/auth/invite/accept", { body: { token, password } })),
  telegramLink: () => must(adminApi.POST("/api/admin/auth/telegram/link")),
  telegramUnlink: () => must(adminApi.POST("/api/admin/auth/telegram/unlink")),
};
