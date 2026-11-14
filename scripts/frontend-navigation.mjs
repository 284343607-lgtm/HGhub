export async function selectCategorySource(page, name) {
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "分类", exact: true }).click();
  await page.getByRole("navigation", { name: "分类片源" }).getByRole("button", { name, exact: true }).click();
}
export async function openRecommendations(page, name) {
  await selectCategorySource(page, name);
  await page.getByRole("button", { name: `推荐分区 · ${name}`, exact: true }).click();
}
export const installedTab = page => page.getByRole("navigation", { name: "插件中心分栏" }).getByRole("button", { name: /^已安装/ }).click();
export const importTab = page => page.getByRole("button", { name: "导入与订阅", exact: true }).click();
