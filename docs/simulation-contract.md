# 仿真与显示契约（当前基线）

## 单位和坐标

- `src/physics/constants.js` 中 `SCENE_UNITS_PER_AU = 250`；行星和飞船的世界位置使用场景距离单位，时间步使用仿真秒。`G` 和质量是项目的缩放数值，不是 SI 制。
- 卫星 `relPos`、`relVel` 是母星相对、轨道平面坐标；`publishWorld` 将它们旋转并加到母星的世界位置和速度。卫星 `muEff = (speed * SCRIPTED_TIME_SCALE)^2 * orbitR^3` 是为了原有周期校准的参数，不应直接当作 `G * mass`。
- 行星 `pos` / `vel` 和卫星 `pos` / `vel` 是仿真状态；Three.js 场景节点是显示状态。

## 显示比例

- 卫星的 `updateScale` 只调整 mesh、轨道线及显示位置的映射，不改变 `relPos`、`relVel`、`orbitR` 或 `muEff`。关闭真实比例后显示位置应回到仿真轨道位置。
- `setOrbitRadius` 是显式修改卫星仿真轨道的操作，而不是比例切换接口。
- 行星和太阳的显示比例仍由各自 `updateScale` 管理；全局显示与仿真的彻底分离尚未完成。

## 限制

真实比例下卫星显示位置和其仿真世界坐标有意不同。当前自动驾驶目的地从 `physicsEngine.activePlanets` 选取，不含卫星；飞船引力和碰撞循环也处理行星而非卫星。相机聚焦读取 mesh 世界位置。未来若支持飞船导航或碰撞卫星，必须明确映射而不能直接混用 `pos` 和 mesh 坐标。全局其他坐标消费者仍需审计，不能宣称整个应用已完成分离。引力扰动也尚未实现。
