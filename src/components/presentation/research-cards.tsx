"use client";

import { motion } from "framer-motion";
import { Building2, Wheat, TrendingUp, Users } from "lucide-react";

/** 调研卡片展开动画 */
export function ResearchCards() {
  const items = [
    {
      name: "山姆会员店", icon: Building2,
      iconBg: "bg-blue-500/20", iconColor: "text-blue-400",
      hoverBorder: "hover:border-blue-500/30",
      insight: "终端零售的严苛标准",
      detail: "供应商数据库 · 按品类拆解 8+ 家核心企业",
    },
    {
      name: "东升农场", icon: Wheat,
      iconBg: "bg-emerald-500/20", iconColor: "text-emerald-400",
      hoverBorder: "hover:border-emerald-500/30",
      insight: "菜心采收全靠人工",
      detail: "年产值 18 亿 · 亩产值 ≥ 2 万才不亏本",
    },
    {
      name: "红星农批市场", icon: TrendingUp,
      iconBg: "bg-amber-500/20", iconColor: "text-amber-400",
      hoverBorder: "hover:border-amber-500/30",
      insight: "百亿流通网络的数据荒",
      detail: "年交易额 700 亿 · 冷链 30 万吨库容",
    },
    {
      name: "大队长农业", icon: Users,
      iconBg: "bg-purple-500/20", iconColor: "text-purple-400",
      hoverBorder: "hover:border-purple-500/30",
      insight: "农机共享的平台机会",
      detail: "农机共享平台模式 · 产业协同需求",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.15, type: "spring" }}
          whileHover={{ scale: 1.03 }}
          className={`p-5 rounded-2xl border bg-white/5 backdrop-blur border-white/10 ${item.hoverBorder} transition-all group cursor-default`}
        >
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl ${item.iconBg} flex items-center justify-center`}>
              <item.icon className={`w-5 h-5 ${item.iconColor}`} />
            </div>
            <h4 className="font-bold text-white text-base">{item.name}</h4>
          </div>
          <p className="text-slate-300 text-sm font-medium mb-1">{item.insight}</p>
          <p className="text-slate-500 text-xs">{item.detail}</p>
        </motion.div>
      ))}
    </div>
  );
}
