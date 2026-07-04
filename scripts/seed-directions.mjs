/**
 * 初始化 4 个固定研究方向
 * 运行: node scripts/seed-directions.mjs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DIRECTIONS = [
  {
    slug: "thermochemistry",
    name: "热化学",
    description: "## 研究方向\n\n生物质/固废热化学转化研究，涵盖热解、气化、燃烧等路径。重点关注反应机理、产物分布、催化剂开发和过程优化。\n\n## 实验线\n\n- TG-FTIR/MS 热解特性分析\n- 固定床/流化床反应器实验\n- 产物 GC-MS/FTIR 表征\n- 动力学建模（KAS/FWO/DAEM）\n\n## 目标期刊层次\n\nBioresource Technology, Energy & Fuels, Fuel, Journal of Analytical and Applied Pyrolysis",
    categories: ["热化学", "热解"],
  },
  {
    slug: "tobacco",
    name: "烟草",
    description: "## 研究方向\n\n烟草化学与烟气分析研究，涵盖烟草成分分析、热解行为、烟气有害成分减害技术。\n\n## 实验线\n\n- 烟草热解/燃烧实验\n- 烟气成分 GC-MS 分析\n- 烟草化学成分提取与分析\n- 感官评价与相关性分析\n\n## 目标期刊层次\n\nTobacco Science & Technology, Beiträge zur Tabakforschung, Journal of Agricultural and Food Chemistry",
    categories: ["烟草"],
  },
  {
    slug: "fireworks",
    name: "烟花",
    description: "## 研究方向\n\n烟火药配方设计与性能优化研究，涵盖燃烧特性、发光/发色机理、安全性和环保性评估。\n\n## 实验线\n\n- 烟火药配方设计\n- 燃烧速度与热效应测试\n- 发光光谱分析\n- 产物分析与环保评估\n\n## 目标期刊层次\n\nPropellants Explosives Pyrotechnics, Journal of Pyrotechnics, Journal of Thermal Analysis and Calorimetry",
    categories: ["烟花"],
  },
  {
    slug: "light-plants",
    name: "光与植物",
    description: "## 研究方向\n\n植被与光化学交叉研究，涵盖光质/光周期对植物生长的影响、光催化材料在农业中的应用、植物光响应机制。\n\n## 实验线\n\n- LED 光质调控植物生长实验\n- 光催化材料制备与表征\n- 植物生理指标测定\n- 光响应曲线与光合效率分析\n\n## 目标期刊层次\n\nJournal of Photochemistry and Photobiology, Plant Physiology, Environmental and Experimental Botany",
    categories: ["茶学", "控释肥类"],
  },
];

async function main() {
  console.log("🌱 初始化 4 个固定研究方向...\n");

  for (const dir of DIRECTIONS) {
    const existing = await prisma.direction.findUnique({
      where: { slug: dir.slug },
    });

    if (existing) {
      // 更新（保留已有 assets/analysis/roadmap）
      await prisma.direction.update({
        where: { slug: dir.slug },
        data: {
          name: dir.name,
          description: dir.description,
          categories: dir.categories,
        },
      });
      console.log(`  ✅ ${dir.name} (${dir.slug}) — 已更新（保留已有数据）`);
    } else {
      await prisma.direction.create({
        data: {
          slug: dir.slug,
          name: dir.name,
          description: dir.description,
          categories: dir.categories,
          status: "active",
          assets: [],
        },
      });
      console.log(`  ✨ ${dir.name} (${dir.slug}) — 已创建`);
    }
  }

  console.log(`\n🎉 完成。${DIRECTIONS.length} 个方向已就绪。`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ seed 失败:", err);
  process.exit(1);
});
