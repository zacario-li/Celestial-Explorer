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
            { name: 'Mimas', r: 0.4, c: 0xaaaaaa, dist: 22, speed: 0.02, m: '3.7 × 10¹⁹ kg', mr: '< 0.0001 Earths', ir: '198 km', d: '1.14 g/cm³' },
            { name: 'Enceladus', r: 0.5, c: 0xeeeeee, dist: 28, speed: 0.015, m: '1.08 × 10²⁰ kg', mr: '< 0.0001 Earths', ir: '252 km', d: '1.61 g/cm³' },
            { name: 'Tethys', r: 0.7, c: 0xcccccc, dist: 35, speed: 0.012, m: '6.1 × 10²⁰ kg', mr: '< 0.0001 Earths', ir: '531 km', d: '0.98 g/cm³' },
            { name: 'Dione', r: 0.8, c: 0xbbbbbb, dist: 43, speed: 0.009, m: '1.1 × 10²¹ kg', mr: '< 0.001 Earths', ir: '561 km', d: '1.47 g/cm³' },
            { name: 'Rhea', r: 1.1, c: 0xaaaaaa, dist: 52, speed: 0.007, m: '2.3 × 10²¹ kg', mr: '< 0.001 Earths', ir: '763 km', d: '1.23 g/cm³' },
            { name: 'Titan', r: 2.1, c: 0xfcb41c, dist: 65, speed: 0.005, m: '1.34 × 10²³ kg', mr: '~ 0.022 Earths', ir: '2,575 km', d: '1.88 g/cm³' },
            { name: 'Iapetus', r: 1.0, c: 0x888888, dist: 85, speed: 0.003, m: '1.8 × 10²¹ kg', mr: '< 0.001 Earths', ir: '734 km', d: '1.08 g/cm³' }
        ]
    },
    { 
        name: 'Uranus',  r: 11, c: 0xb1d8e0, dist: 2200, speed: 0.00001, rotSpeed: -0.0550, 
        mass: '8.681 × 10²⁵ kg', massRel: '~ 14.5 Earths', radius: '25,362 km', density: '1.27 g/cm³',
        massValue: 14.5, angle: 0.96, moons: [
            { name: 'Ariel', r: 0.8, c: 0xaaaaaa, dist: 20, speed: 0.01, m: '1.3 × 10²¹ kg', mr: '< 0.001 Earths', ir: '579 km', d: '1.67 g/cm³' },
            { name: 'Titania', r: 1.0, c: 0xaaaaaa, dist: 28, speed: 0.008, m: '3.5 × 10²¹ kg', mr: '< 0.001 Earths', ir: '788 km', d: '1.71 g/cm³' },
            { name: 'Oberon', r: 0.9, c: 0x999999, dist: 36, speed: 0.006, m: '3.0 × 10²¹ kg', mr: '< 0.001 Earths', ir: '761 km', d: '1.63 g/cm³' }
        ]
    },
    { 
        name: 'Neptune', r: 11, c: 0x3d5c9c, dist: 3000, speed: 0.000006, rotSpeed: 0.0590, 
        mass: '1.024 × 10²⁶ kg', massRel: '~ 17.1 Earths', radius: '24,622 km', density: '1.64 g/cm³',
        massValue: 17.1, angle: 6.10, moons: [
            { name: 'Triton', r: 1.3, c: 0xdddddd, dist: 25, speed: 0.009, m: '2.1 × 10²² kg', mr: '~ 0.0035 Earths', ir: '1,353 km', d: '2.06 g/cm³' }
        ]
    },
    {
        name: 'Pluto',  r: 3, c: 0x9a8e7d, dist: 4000, speed: 0.000003, rotSpeed: 0.01,
        mass: '1.303 × 10²² kg', massRel: '~ 0.002 Earths', radius: '1,188 km', density: '1.85 g/cm³',
        massValue: 0.002, angle: 2.5, moons: [
            { name: 'Charon', r: 1.2, c: 0xaaaaaa, dist: 15, speed: 0.012, m: '1.58 × 10²¹ kg', mr: '< 0.001 Earths', ir: '606 km', d: '1.71 g/cm³' }
        ]
    },
    {
        name: 'Ceres',  r: 2.2, c: 0x888888, dist: 650, speed: 0.0001, rotSpeed: 0.02,
        mass: '9.39 × 10²⁰ kg', massRel: '< 0.0002 Earths', radius: '473 km', density: '2.16 g/cm³',
        massValue: 0.0002, angle: 4.0, moons: []
    },
    {
        name: 'Vesta',  r: 2.5, c: 0x777777, dist: 580, speed: 0.00015, rotSpeed: 0.025,
        mass: '2.59 × 10²² kg', massRel: '~ 0.004 Earths', radius: '500+ km', density: '3.46 g/cm³',
        massValue: 0.01, angle: 5.5, moons: []
    }
];
