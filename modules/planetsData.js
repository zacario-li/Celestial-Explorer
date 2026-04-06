export const planetsData = [
    { 
        name: 'Mercury', r: 4, c: 0x8e8e8e, dist: 100, speed: 0.0041, rotSpeed: 0.0007, 
        mass: '3.301 × 10²³ kg', massRel: '~ 0.055 Earths', radius: '2,440 km', density: '5.43 g/cm³',
        massValue: 0.055, angle: 4.36, moons: []
    },
    { 
        name: 'Venus',   r: 7, c: 0xe3bb76, dist: 180, speed: 0.0016, rotSpeed: -0.00016, 
        mass: '4.867 × 10²⁴ kg', massRel: '~ 0.815 Earths', radius: '6,052 km', density: '5.24 g/cm³',
        massValue: 0.815, angle: 0.87, moons: []
    },
    { 
        name: 'Earth',   r: 8, c: 0x4b95f2, dist: 250, speed: 0.0010, rotSpeed: 0.0400, 
        mass: '5.972 × 10²⁴ kg', massRel: '1.000 Earth Mass', radius: '6,371 km', density: '5.51 g/cm³',
        massValue: 1.0, angle: 3.14, moons: [
            { name: 'The Moon', r: 2.0, c: 0xaaaaaa, dist: 28, speed: 0.008, m: '7.347 × 10²² kg', mr: '~ 0.0123 Earths', ir: '1,737 km', d: '3.34 g/cm³' }
        ]
    },
    { 
        name: 'Mars',    r: 5, c: 0xdb6d46, dist: 380, speed: 0.0005, rotSpeed: 0.0380, 
        mass: '6.390 × 10²³ kg', massRel: '~ 0.107 Earths', radius: '3,390 km', density: '3.93 g/cm³',
        massValue: 0.107, angle: 2.09, moons: [
            { name: 'Phobos', r: 0.4, c: 0x888888, dist: 8, speed: 0.02, m: '1.065 × 10¹⁶ kg', mr: '< 0.0001 Earths', ir: '11.1 km', d: '1.87 g/cm³' },
            { name: 'Deimos', r: 0.3, c: 0x666666, dist: 12, speed: 0.012, m: '1.476 × 10¹⁵ kg', mr: '< 0.0001 Earths', ir: '6.2 km', d: '1.47 g/cm³' }
        ]
    },
    { 
        name: 'Jupiter', r: 20, c: 0xc99b75, dist: 900, speed: 0.00008, rotSpeed: 0.0970, 
        mass: '1.898 × 10²⁷ kg', massRel: '~ 317.8 Earths', radius: '69,911 km', density: '1.33 g/cm³',
        massValue: 317.8, angle: 1.22, moons: [
            { name: 'Io', r: 1.5, c: 0xfff000, dist: 30, speed: 0.015, m: '8.9 × 10²² kg', mr: '~ 0.015 Earths', ir: '1,821 km', d: '3.53 g/cm³' },
            { name: 'Europa', r: 1.4, c: 0xcccccc, dist: 38, speed: 0.01, m: '4.8 × 10²² kg', mr: '~ 0.008 Earths', ir: '1,560 km', d: '3.01 g/cm³' },
            { name: 'Ganymede', r: 2.2, c: 0xaaaaaa, dist: 48, speed: 0.007, m: '1.48 × 10²³ kg', mr: '~ 0.025 Earths', ir: '2,634 km', d: '1.94 g/cm³' },
            { name: 'Callisto', r: 1.9, c: 0x888888, dist: 60, speed: 0.004, m: '1.07 × 10²³ kg', mr: '~ 0.018 Earths', ir: '2,410 km', d: '1.83 g/cm³' }
        ]
    },
    { 
        name: 'Saturn',  r: 17, c: 0xe3d294, dist: 1500, speed: 0.00003, rotSpeed: 0.0880, 
        mass: '5.683 × 10²⁶ kg', massRel: '~ 95.2 Earths', radius: '58,232 km', density: '0.69 g/cm³',
        massValue: 95.2, angle: 5.93, moons: [
            { name: 'Titan', r: 2.1, c: 0xfcb41c, dist: 55, speed: 0.005, m: '1.34 × 10²³ kg', mr: '~ 0.022 Earths', ir: '2,575 km', d: '1.88 g/cm³' }
        ]
    },
    { 
        name: 'Uranus',  r: 11, c: 0xb1d8e0, dist: 2200, speed: 0.00001, rotSpeed: -0.0550, 
        mass: '8.681 × 10²⁵ kg', massRel: '~ 14.5 Earths', radius: '25,362 km', density: '1.27 g/cm³',
        massValue: 14.5, angle: 0.96, moons: [
            { name: 'Titania', r: 1.0, c: 0xaaaaaa, dist: 25, speed: 0.008, m: '3.5 × 10²¹ kg', mr: '< 0.001 Earths', ir: '788 km', d: '1.71 g/cm³' }
        ]
    },
    { 
        name: 'Neptune', r: 11, c: 0x3d5c9c, dist: 3000, speed: 0.000006, rotSpeed: 0.0590, 
        mass: '1.024 × 10²⁶ kg', massRel: '~ 17.1 Earths', radius: '24,622 km', density: '1.64 g/cm³',
        massValue: 17.1, angle: 6.10, moons: [
            { name: 'Triton', r: 1.3, c: 0xdddddd, dist: 25, speed: 0.009, m: '2.1 × 10²² kg', mr: '~ 0.0035 Earths', ir: '1,353 km', d: '2.06 g/cm³' }
        ]
    },
];
