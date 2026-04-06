import { state } from './state.js';

export const i18n = {
    en: {
        title: 'Celestial Explorer',
        subtitle: 'Double-click object to focus • Drag to rotate',
        navTitle: 'Planets',
        pause: '⏸ PAUSE',
        resume: '▶ RESUME',
        autoRotateOn: '🔄 AUTO-PAN: ON',
        autoRotateOff: '🔄 AUTO-PAN: OFF',
        highvis: '☀️ HIGH-VIS',
        overviewOn: '🌌 OVERVIEW',
        overviewOff: '🌌 EXIT OVERVIEW',
        spawnPlanet: '➕ SPAWN PLANET',
        modalCustomizeTitle: 'Customize Planet',
        modalTemplate: 'Base Template:',
        modalDistance: 'Orbit Distance:',
        modalMass: 'Mass Multiplier:',
        modalCancel: 'CANCEL',
        modalConfirm: 'SPAWN!',
        optRandom: '🎲 Random',
        langSwitch: '🌐 中文',
        mass: 'Mass',
        radius: 'Radius',
        density: 'Density',
        names: {
            'The Sun': 'The Sun', 'Mercury': 'Mercury', 'Venus': 'Venus',
            'Earth': 'Earth', 'Mars': 'Mars', 'Jupiter': 'Jupiter',
            'Saturn': 'Saturn', 'Uranus': 'Uranus', 'Neptune': 'Neptune',
            'The Moon': 'The Moon', 'Phobos': 'Phobos', 'Deimos': 'Deimos',
            'Io': 'Io', 'Europa': 'Europa', 'Ganymede': 'Ganymede',
            'Callisto': 'Callisto', 'Titan': 'Titan', 'Titania': 'Titania',
            'Triton': 'Triton'
        }
    },
    zh: {
        title: '星空探索者',
        subtitle: '双击天体聚焦 • 拖拽旋转',
        navTitle: '行星列表',
        pause: '⏸ 暂停',
        resume: '▶ 继续',
        autoRotateOn: '🔄 自动旋转：开',
        autoRotateOff: '🔄 自动旋转：关',
        highvis: '☀️ 高亮',
        overviewOn: '🌌 系统全貌',
        overviewOff: '🌌 退出全貌',
        spawnPlanet: '➕ 生成新行星',
        modalCustomizeTitle: '自定义行星',
        modalTemplate: '基底复制模板：',
        modalDistance: '相对轨道距离：',
        modalMass: '引力质量倍数：',
        modalCancel: '取消',
        modalConfirm: '立即投射！',
        optRandom: '🎲 随机盲盒',
        langSwitch: '🌐 English',
        mass: '质量',
        radius: '半径',
        density: '密度',
        names: {
            'The Sun': '太阳', 'Mercury': '水星', 'Venus': '金星',
            'Earth': '地球', 'Mars': '火星', 'Jupiter': '木星',
            'Saturn': '土星', 'Uranus': '天王星', 'Neptune': '海王星',
            'The Moon': '月球', 'Phobos': '火卫一', 'Deimos': '火卫二',
            'Io': '木卫一', 'Europa': '木卫二', 'Ganymede': '木卫三',
            'Callisto': '木卫四', 'Titan': '土卫六', 'Titania': '天卫三',
            'Triton': '海卫一'
        }
    }
};

export function t(key) {
    return i18n[state.currentLang][key];
}

export function tName(engName) {
    return i18n[state.currentLang].names[engName] || engName;
}
