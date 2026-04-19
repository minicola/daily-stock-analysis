import { NavLink } from "react-router-dom";

const NAV = [
  { to: "/", label: "仪表盘", end: true },
  { to: "/market", label: "行情" },
  { to: "/portfolio", label: "组合" },
  { to: "/screener", label: "筛选" },
  { to: "/analysis", label: "分析" },
  { to: "/settings/accounts", label: "账户" },
];

export function Sidebar() {
  return (
    <nav className="w-44 shrink-0 border-r border-slate-800 p-3 space-y-1">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `block rounded px-3 py-2 text-sm ${
              isActive ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
