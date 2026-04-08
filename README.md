# 🌌 Celestial Explorer

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Three.js](https://img.shields.io/badge/Three.js-r160-black)](https://threejs.org/)

**Celestial Explorer** is a high-fidelity, interactive 3D solar system simulation built with Three.js. It combines physically plausible orbital mechanics with modern web performance optimizations, offering an immersive educational and visual experience.

![Header Overview](assets/readme/header_overview.png)

---

## 🚀 Key Features

### 🎮 Spaceship Pilot Mode (6DOF)
Take command of a stylized sci-fi spaceship. The simulation features a fully controllable flight engine:
- **6 Degrees of Freedom**: Pitch, Yaw, Roll, and Thrust control.
- **Chase Camera**: A dynamic follow-camera system for an immersive piloting experience.
- **Interplanetary Travel**: Seamlessly detach from Earth's orbit and fly across the solar system in global coordinates.

### ⚛️ Real-Time Physics
- **Newtonian Gravity**: Realistic orbital calculations for planets, moons, and thousands of asteroids.
- **Collision Merging**: Bodies that collide will physically merge, combining their mass and volume in real-time.

### ⚡ Performance Optimizations
- **Multi-Tier Resolution**: Automatic texture resolution swapping based on device power (Ultra-Low, Low, High).
- **Lazy Loading**: Assets are fetched on-demand when an object is focused, drastically reducing initial load times.
- **Belt Toggles**: Toggle the Asteroid and Kuiper belts on/off to boost frame rates on lower-end devices.

### 🌍 Localization & UI
- **Full Bilingual Support**: Toggle between English and Chinese (🌐 中文) at any time.
- **Deep Focus Mode**: Double-click any planet or moon to focus the camera and view detailed scientific data.

---

## 📸 Screenshots

| Focused Exploration | Spaceship HUD |
| :---: | :---: |
| ![Earth Focus](assets/readme/earth_focus.png) | ![Pilot Mode](assets/readme/pilot_mode.png) |

---

## 🛠️ Technology Stack

- **Core Engine**: [Three.js](https://threejs.org/) (WebGL)
- **Styling**: Vanilla CSS (Modern design patterns, glassmorphism)
- **Logic**: Vanilla JavaScript (ES6+ Modules)
- **Assets**: 1k-4k Planetary Textures & Procedural Starfields.

---

## ⌨️ Controls

### Simulation Controls
| Action | Input |
| :--- | :--- |
| **Rotate Camera** | Left Click + Drag |
| **Pan Camera** | Right Click + Drag |
| **Zoom In/Out** | Scroll Wheel |
| **Focus Object** | Double Click |
| **Reset View** | Click "Overview" Button |

### 🚀 Flight Controls (Pilot Mode)
| Action | Input |
| :--- | :--- |
| **Thrust (Forward/Back)** | `W` / `S` |
| **Yaw (Left/Right)** | `A` / `D` |
| **Roll (Rotate)** | `Q` / `E` |
| **Pitch (Up/Down)** | `Arrow Up` / `Arrow Down` |
| **Turbo Boost** | `Shift` (Hold) |

---

## 📥 Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/zacario-li/Celestial-Explorer.git
   ```

2. **Run a local server**:
   Since the project uses ES Modules, you need a local server. You can use `serve` or VS Code Live Server:
   ```bash
   npx serve .
   ```

3. **Open in Browser**:
   Navigate to `http://localhost:3000` (or the port specified by your server).

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.

---

*Made with ✨ by the Celestial Explorer team.*
