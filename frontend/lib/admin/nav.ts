/** Разделы админки и кто их видит (права сотрудников — галочки по разделам, SPEC 10.9). */
import {
  Boxes,
  ClipboardList,
  Ellipsis,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Percent,
  Send,
  Settings,
  ShoppingBag,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";

export type Permission = "orders" | "products" | "inventory" | "customers" | "promotions" | "content" | "applications";

export interface NavUser {
  is_owner: boolean;
  permissions: string[];
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  ownerOnly?: boolean;
  /** в нижней панели на телефоне */
  bottom?: boolean;
}

export const NAV: NavItem[] = [
  { href: "/admin", label: "Сводка", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Заказы", icon: ShoppingBag, permission: "orders", bottom: true },
  { href: "/admin/products", label: "Товары", icon: Package, permission: "products", bottom: true },
  { href: "/admin/inventory", label: "Склад", icon: Boxes, permission: "inventory", bottom: true },
  { href: "/admin/promotions", label: "Акции", icon: Percent, permission: "promotions", bottom: true },
  { href: "/admin/customers", label: "Клиенты", icon: UsersRound, permission: "customers" },
  { href: "/admin/applications", label: "Заявки", icon: Inbox, permission: "applications" },
  { href: "/admin/content", label: "Сайт: страницы и события", icon: FileText, permission: "content" },
  { href: "/admin/settings", label: "Настройки", icon: Settings, ownerOnly: true },
  { href: "/admin/staff", label: "Сотрудники", icon: Users, ownerOnly: true },
  { href: "/admin/notifications", label: "Уведомления в Telegram", icon: Send, ownerOnly: true },
  { href: "/admin/audit", label: "Журнал действий", icon: History, ownerOnly: true },
];

export const PROFILE: NavItem = { href: "/admin/profile", label: "Мой профиль", icon: UserRound };
export const MORE: NavItem = { href: "/admin/more", label: "Ещё", icon: Ellipsis };
export const PRINT_ICON = ClipboardList;

export function can(user: NavUser, item: Pick<NavItem, "permission" | "ownerOnly">): boolean {
  if (user.is_owner) return true;
  if (item.ownerOnly) return false;
  return !item.permission || user.permissions.includes(item.permission);
}

export function sideNav(user: NavUser): NavItem[] {
  return NAV.filter((item) => can(user, item));
}

export function bottomNav(user: NavUser): NavItem[] {
  return [...NAV.filter((item) => item.bottom && can(user, item)), MORE];
}

/** Экран «Ещё» на телефоне: всё, чего нет в нижней панели, и профиль. */
export function moreNav(user: NavUser): NavItem[] {
  return [...NAV.filter((item) => !item.bottom && can(user, item)), PROFILE];
}

export function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}
