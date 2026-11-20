/**
 * The three maps, in grid cells (CELL = 48 world units). Everything not carved as a district or door is wall.
 * Props and tasks list candidate spots; the seeds choose among them.
 */
import { buildLayout, type MapDef, type Layout } from './layout.js';

/** Collision radius of each prop kind. Disguised thieves keep the player radius; only the look changes. */
export const PROP_KINDS: Record<string, { r: number; label: string }> = {
    statue: { r: 22, label: 'statue' }, plant: { r: 18, label: 'potted plant' }, bench: { r: 24, label: 'bench' }, bin: { r: 16, label: 'bin' },
    gem: { r: 18, label: 'gem case' }, candelabra: { r: 18, label: 'candelabra' }, silver: { r: 18, label: 'silver candelabra' }, shield: { r: 18, label: 'shield' },
    crate: { r: 20, label: 'crate' }, tree: { r: 20, label: 'planter' },
    fruit: { r: 20, label: 'fruit crate' }, produce: { r: 20, label: 'produce stand' }, barrel: { r: 18, label: 'barrel' }, hydrant: { r: 14, label: 'hydrant' },
    mailbox: { r: 16, label: 'mailbox' }, sack: { r: 16, label: 'sack' }, lantern: { r: 16, label: 'lantern post' }, parcel: { r: 16, label: 'parcel' },
    cabinet: { r: 20, label: 'arcade cabinet' }, cabinet2: { r: 20, label: 'arcade cabinet' }, claw: { r: 20, label: 'claw machine' }, umbrella: { r: 18, label: 'beach umbrella' },
    buoy: { r: 16, label: 'life ring' }, chair: { r: 16, label: 'café chair' }, stool: { r: 14, label: 'stool' },
};

const museum: MapDef = {
    id: 'museum', name: 'Grand Museum After Hours', theme: 'museum', cols: 88, rows: 54, roundSeconds: 240,
    blurb: 'Galleries, a sculpture hall, a moonlit courtyard and a loading bay with one way out.',
    districts: [
        { name: 'Old Masters Gallery', rect: [1, 1, 26, 16], floor: 'parquet' },
        { name: 'Sculpture Hall', rect: [28, 1, 31, 16], floor: 'marble' },
        { name: 'Modern Wing', rect: [60, 1, 27, 16], floor: 'gallery' },
        { name: 'Restoration Rooms', rect: [1, 18, 20, 16], floor: 'workshop' },
        { name: 'Grand Foyer', rect: [22, 18, 20, 16], floor: 'marble' },
        { name: 'Courtyard', rect: [43, 18, 22, 16], floor: 'grass' },
        { name: 'Security Wing', rect: [66, 18, 21, 16], floor: 'carpet' },
        { name: 'Archives', rect: [1, 35, 24, 18], floor: 'archive' },
        { name: 'Hall of Curiosities', rect: [26, 35, 26, 18], floor: 'parquet' },
        { name: 'Loading Bay', rect: [53, 35, 28, 18], floor: 'concrete' },
        { name: 'Loading Dock', rect: [82, 41, 5, 7], floor: 'asphalt' },
        { name: 'Security Office', rect: [77, 18, 10, 8], floor: 'carpet', quiet: true },
    ],
    doors: [
        [8, 17, 3, 1], [23, 17, 3, 1], [33, 17, 4, 1], [50, 17, 4, 1], [61, 17, 3, 1], [70, 17, 3, 1],
        [27, 4, 1, 3], [27, 12, 1, 3], [59, 5, 1, 3], [59, 12, 1, 3],
        [21, 25, 1, 4], [42, 20, 1, 3], [42, 29, 1, 3], [65, 22, 1, 3],
        [6, 34, 3, 1], [28, 34, 4, 1], [46, 34, 3, 1], [58, 34, 3, 1], [72, 34, 3, 1],
        [25, 38, 1, 3], [25, 48, 1, 3], [52, 39, 1, 3], [52, 48, 1, 3],
    ],
    optional: [[27, 8, 1, 2], [21, 19, 1, 2], [65, 30, 1, 2], [37, 34, 3, 1], [25, 43, 1, 2], [52, 44, 1, 2], [15, 17, 3, 1], [59, 8, 1, 2], [42, 25, 1, 2], [15, 34, 3, 1]],
    blocks: [
        { rect: [6, 4, 1, 9], look: 'wall' }, { rect: [12, 3, 1, 4], look: 'wall' }, { rect: [12, 11, 1, 4], look: 'wall' }, { rect: [19, 4, 1, 9], look: 'wall' },
        { rect: [41, 6, 6, 5], look: 'monument' }, { rect: [31, 7, 1, 1], look: 'pillar' }, { rect: [55, 7, 1, 1], look: 'pillar' }, { rect: [31, 11, 1, 1], look: 'pillar' }, { rect: [55, 11, 1, 1], look: 'pillar' },
        { rect: [66, 4, 7, 1], look: 'wall' }, { rect: [66, 12, 7, 1], look: 'wall' }, { rect: [77, 3, 1, 6], look: 'wall' }, { rect: [77, 11, 1, 5], look: 'wall' }, { rect: [82, 8, 4, 1], look: 'wall' },
        { rect: [3, 21, 4, 2], look: 'desk' }, { rect: [11, 21, 5, 2], look: 'desk' }, { rect: [3, 28, 4, 2], look: 'desk' }, { rect: [11, 28, 5, 2], look: 'desk' }, { rect: [16, 25, 3, 1], look: 'shelf' },
        { rect: [29, 24, 7, 2], look: 'counter' }, { rect: [24, 21, 1, 1], look: 'pillar' }, { rect: [39, 21, 1, 1], look: 'pillar' }, { rect: [24, 30, 1, 1], look: 'pillar' }, { rect: [39, 30, 1, 1], look: 'pillar' },
        { rect: [51, 23, 6, 6], look: 'fountain' }, { rect: [45, 20, 5, 1], look: 'hedge' }, { rect: [57, 20, 5, 1], look: 'hedge' }, { rect: [45, 31, 5, 1], look: 'hedge' }, { rect: [57, 31, 5, 1], look: 'hedge' },
        { rect: [68, 20, 5, 2], look: 'desk' }, { rect: [68, 29, 5, 2], look: 'desk' }, { rect: [79, 29, 6, 1], look: 'shelf' },
        { rect: [76, 18, 1, 9], look: 'wall' }, { rect: [76, 26, 4, 1], look: 'wall' }, { rect: [83, 26, 4, 1], look: 'wall' },
        { rect: [3, 38, 9, 1], look: 'shelf' }, { rect: [3, 42, 9, 1], look: 'shelf' }, { rect: [3, 46, 9, 1], look: 'shelf' }, { rect: [15, 37, 1, 7], look: 'shelf' }, { rect: [19, 37, 1, 7], look: 'shelf' }, { rect: [15, 47, 7, 1], look: 'shelf' },
        { rect: [29, 39, 3, 2], look: 'cabinets' }, { rect: [36, 39, 3, 2], look: 'cabinets' }, { rect: [43, 39, 3, 2], look: 'cabinets' }, { rect: [29, 47, 3, 2], look: 'cabinets' }, { rect: [36, 47, 3, 2], look: 'cabinets' }, { rect: [43, 47, 3, 2], look: 'cabinets' },
        { rect: [56, 38, 3, 3], look: 'crates' }, { rect: [56, 47, 3, 3], look: 'crates' }, { rect: [65, 41, 4, 4], look: 'crates' }, { rect: [73, 37, 3, 2], look: 'crates' }, { rect: [73, 49, 3, 2], look: 'crates' },
    ],
    staging: [77, 18, 10, 8], gate: [80, 26, 3, 1], exitZone: [82, 41, 5, 7], exitDoor: [81, 42, 1, 5], spawn: [24, 27, 15, 5],
    props: [
        { kinds: ['bench', 'plant', 'statue', 'gem', 'candelabra', 'bin'], pick: 11, spots: [[2, 2], [2, 9], [2, 15], [9, 2], [16, 2], [24, 2], [24, 9], [9, 15], [16, 15], [24, 15], [7, 8], [11, 8], [13, 8], [18, 8], [20, 8], [5, 13]] },
        { kinds: ['statue', 'statue', 'statue', 'bench', 'plant', 'silver'], pick: 12, spots: [[30, 3], [34, 3], [38, 3], [50, 3], [54, 3], [57, 3], [30, 14], [34, 14], [38, 14], [50, 14], [54, 14], [57, 14], [40, 12], [48, 12], [44, 13], [33, 8], [53, 8]] },
        { kinds: ['statue', 'gem', 'shield', 'bench', 'plant', 'bin'], pick: 10, spots: [[61, 2], [61, 15], [68, 2], [70, 7], [74, 2], [80, 2], [85, 2], [85, 6], [85, 14], [80, 14], [70, 14], [63, 9], [74, 9], [80, 10]] },
        { kinds: ['crate', 'crate', 'statue', 'bin', 'plant'], pick: 7, spots: [[2, 19], [2, 32], [9, 19], [18, 19], [18, 32], [9, 32], [2, 25], [14, 25], [9, 25], [18, 27]] },
        { kinds: ['plant', 'bench', 'bin', 'plant', 'statue'], pick: 6, spots: [[23, 19], [40, 19], [23, 32], [40, 32], [26, 22], [37, 22], [32, 20]] },
        { kinds: ['plant', 'plant', 'bench', 'tree', 'bin'], pick: 8, spots: [[44, 19], [63, 19], [44, 32], [63, 32], [48, 25], [59, 25], [54, 21], [54, 30], [47, 28], [60, 22], [49, 22], [58, 29]] },
        { kinds: ['bin', 'plant', 'bench', 'crate'], pick: 4, spots: [[67, 19], [67, 32], [73, 24], [73, 32], [86, 32], [86, 28], [75, 30]] },
        { kinds: ['crate', 'crate', 'bin', 'plant', 'statue'], pick: 9, spots: [[2, 36], [2, 51], [13, 36], [23, 36], [23, 51], [13, 51], [13, 40], [13, 44], [17, 45], [21, 41], [2, 44], [8, 40], [8, 48]] },
        { kinds: ['gem', 'silver', 'shield', 'candelabra', 'plant', 'bench', 'statue'], pick: 9, spots: [[27, 36], [50, 36], [27, 51], [50, 51], [33, 43], [40, 43], [47, 43], [30, 44], [38, 36], [38, 51], [33, 51]] },
        { kinds: ['crate', 'crate', 'bin', 'plant'], pick: 9, spots: [[54, 36], [79, 36], [54, 51], [79, 51], [62, 38], [62, 50], [70, 38], [70, 51], [63, 46], [77, 45], [60, 44], [71, 46]] },
    ],
    tasks: {
        panel: [[2, 12], [57, 2], [86, 14], [20, 31], [24, 51], [51, 37], [44, 33]],
        label: [[10, 6], [40, 8], [64, 14], [36, 26], [40, 45], [8, 44], [54, 29]],
        loading: [[79, 39], [55, 51], [67, 36], [18, 52], [62, 32], [84, 32], [44, 51]],
    },
    lights: [[13, 8], [43, 4], [73, 8], [10, 25], [31, 21], [54, 26], [72, 25], [12, 44], [38, 44], [66, 44], [84, 44]],
};

const market: MapDef = {
    id: 'market', name: 'Night Market', theme: 'market', cols: 88, rows: 54, roundSeconds: 240,
    blurb: 'Lantern-lit stalls, a busy food court, back alleys and a delivery yard gate.',
    districts: [
        { name: 'Night Stalls', rect: [1, 1, 40, 15], floor: 'cobble' },
        { name: 'Lantern Lane', rect: [42, 1, 22, 15], floor: 'cobble' },
        { name: 'Cold Storage', rect: [65, 1, 22, 15], floor: 'tile' },
        { name: 'Spice Alley', rect: [1, 17, 14, 20], floor: 'cobble' },
        { name: 'Food Court', rect: [16, 17, 34, 20], floor: 'tile' },
        { name: 'Fishmongers', rect: [51, 17, 17, 20], floor: 'tile' },
        { name: 'Back Alley', rect: [69, 17, 18, 20], floor: 'asphalt' },
        { name: 'Flower Row', rect: [1, 38, 30, 15], floor: 'cobble' },
        { name: 'Warehouse', rect: [32, 38, 30, 15], floor: 'concrete' },
        { name: 'Delivery Yard', rect: [63, 38, 19, 15], floor: 'asphalt' },
        { name: 'Loading Gate', rect: [83, 42, 4, 7], floor: 'asphalt' },
        { name: 'Market Office', rect: [77, 1, 10, 8], floor: 'tile', quiet: true },
    ],
    doors: [
        [6, 16, 3, 1], [20, 16, 4, 1], [34, 16, 4, 1], [46, 16, 3, 1], [56, 16, 3, 1], [72, 16, 3, 1],
        [41, 4, 1, 3], [41, 11, 1, 3], [64, 6, 1, 3], [64, 12, 1, 3],
        [15, 22, 1, 3], [15, 31, 1, 3], [50, 20, 1, 3], [50, 30, 1, 4], [68, 24, 1, 4],
        [5, 37, 3, 1], [24, 37, 4, 1], [40, 37, 4, 1], [57, 37, 3, 1], [74, 37, 3, 1],
        [31, 41, 1, 3], [31, 48, 1, 3], [62, 42, 1, 3], [62, 49, 1, 2],
    ],
    optional: [[41, 8, 1, 2], [64, 9, 1, 2], [15, 27, 1, 2], [50, 26, 1, 2], [68, 32, 1, 2], [12, 37, 3, 1], [47, 37, 3, 1], [31, 45, 1, 2], [62, 46, 1, 2], [28, 16, 3, 1]],
    blocks: [
        { rect: [4, 4, 6, 2], look: 'stall' }, { rect: [13, 4, 6, 2], look: 'stall' }, { rect: [22, 4, 6, 2], look: 'stall' }, { rect: [31, 4, 6, 2], look: 'stall' },
        { rect: [4, 10, 6, 2], look: 'stall' }, { rect: [13, 10, 6, 2], look: 'stall' }, { rect: [22, 10, 6, 2], look: 'stall' }, { rect: [31, 10, 6, 2], look: 'stall' },
        { rect: [45, 4, 3, 3], look: 'awning' }, { rect: [52, 4, 3, 3], look: 'awning' }, { rect: [58, 4, 3, 3], look: 'awning' }, { rect: [48, 10, 4, 2], look: 'stall' }, { rect: [56, 10, 4, 2], look: 'stall' },
        { rect: [67, 3, 1, 8], look: 'shelf' }, { rect: [71, 3, 1, 8], look: 'shelf' }, { rect: [67, 13, 8, 1], look: 'shelf' }, { rect: [79, 12, 6, 1], look: 'crates' },
        { rect: [76, 1, 1, 9], look: 'wall' }, { rect: [76, 9, 4, 1], look: 'wall' }, { rect: [83, 9, 4, 1], look: 'wall' },
        { rect: [4, 20, 2, 5], look: 'stall' }, { rect: [9, 20, 2, 5], look: 'stall' }, { rect: [4, 28, 2, 5], look: 'stall' }, { rect: [9, 28, 2, 5], look: 'stall' },
        { rect: [20, 21, 3, 2], look: 'table' }, { rect: [27, 21, 3, 2], look: 'table' }, { rect: [34, 21, 3, 2], look: 'table' }, { rect: [41, 21, 3, 2], look: 'table' },
        { rect: [20, 32, 3, 2], look: 'table' }, { rect: [27, 32, 3, 2], look: 'table' }, { rect: [34, 32, 3, 2], look: 'table' }, { rect: [41, 32, 3, 2], look: 'table' }, { rect: [29, 25, 7, 4], look: 'counter' },
        { rect: [54, 20, 10, 2], look: 'counter' }, { rect: [54, 27, 2, 5], look: 'counter' }, { rect: [61, 27, 2, 5], look: 'counter' }, { rect: [54, 33, 10, 1], look: 'counter' },
        { rect: [72, 20, 3, 2], look: 'crates' }, { rect: [80, 22, 3, 2], look: 'crates' }, { rect: [72, 30, 3, 2], look: 'crates' }, { rect: [80, 32, 3, 2], look: 'crates' }, { rect: [77, 25, 1, 5], look: 'wall' },
        { rect: [4, 41, 4, 2], look: 'stall' }, { rect: [12, 41, 4, 2], look: 'stall' }, { rect: [20, 41, 4, 2], look: 'stall' }, { rect: [4, 48, 4, 2], look: 'stall' }, { rect: [12, 48, 4, 2], look: 'stall' }, { rect: [20, 48, 4, 2], look: 'stall' },
        { rect: [35, 41, 4, 3], look: 'crates' }, { rect: [44, 41, 4, 3], look: 'crates' }, { rect: [53, 41, 4, 3], look: 'crates' }, { rect: [35, 48, 4, 3], look: 'crates' }, { rect: [44, 48, 4, 3], look: 'crates' }, { rect: [53, 48, 4, 3], look: 'crates' },
        { rect: [66, 41, 5, 3], look: 'crates' }, { rect: [66, 48, 5, 3], look: 'crates' }, { rect: [75, 40, 3, 2], look: 'crates' }, { rect: [75, 50, 3, 2], look: 'crates' },
    ],
    staging: [77, 1, 10, 8], gate: [80, 9, 3, 1], exitZone: [83, 42, 4, 7], exitDoor: [82, 43, 1, 5], spawn: [17, 25, 10, 5],
    props: [
        { kinds: ['fruit', 'produce', 'crate', 'sack', 'lantern', 'bin'], pick: 11, spots: [[3, 2], [11, 2], [20, 2], [29, 2], [38, 2], [3, 8], [11, 7], [20, 8], [29, 7], [38, 8], [11, 14], [20, 14], [29, 14], [38, 14], [3, 14]] },
        { kinds: ['lantern', 'bench', 'plant', 'bin', 'fruit'], pick: 7, spots: [[43, 2], [50, 2], [56, 2], [62, 2], [43, 14], [50, 8], [56, 8], [62, 14], [44, 9], [61, 9]] },
        { kinds: ['crate', 'crate', 'barrel', 'sack', 'parcel'], pick: 7, spots: [[66, 2], [69, 2], [73, 2], [69, 6], [73, 7], [66, 15], [78, 14], [84, 14], [85, 11], [74, 15]] },
        { kinds: ['sack', 'barrel', 'fruit', 'crate', 'plant'], pick: 6, spots: [[2, 18], [13, 18], [2, 35], [13, 35], [7, 24], [7, 33], [2, 27], [13, 26]] },
        { kinds: ['bin', 'bench', 'plant', 'lantern', 'stool', 'chair'], pick: 10, spots: [[17, 18], [48, 18], [17, 35], [48, 35], [24, 22], [31, 22], [38, 22], [45, 22], [24, 31], [38, 30], [45, 30], [38, 26], [44, 27]] },
        { kinds: ['barrel', 'crate', 'bin', 'sack'], pick: 6, spots: [[52, 18], [66, 18], [52, 35], [66, 35], [58, 24], [58, 30], [65, 27], [52, 27]] },
        { kinds: ['bin', 'sack', 'crate', 'hydrant', 'barrel'], pick: 6, spots: [[70, 18], [85, 18], [70, 35], [85, 35], [75, 22], [84, 27], [71, 26], [79, 30]] },
        { kinds: ['plant', 'plant', 'tree', 'fruit', 'bench', 'bin'], pick: 7, spots: [[2, 39], [29, 39], [2, 51], [29, 51], [9, 45], [17, 45], [25, 45], [10, 39], [18, 51]] },
        { kinds: ['crate', 'crate', 'barrel', 'parcel', 'sack'], pick: 7, spots: [[33, 39], [60, 39], [33, 51], [60, 51], [40, 45], [49, 45], [58, 45], [42, 39], [51, 51]] },
        { kinds: ['crate', 'parcel', 'barrel', 'bin', 'hydrant'], pick: 6, spots: [[64, 39], [80, 39], [64, 51], [80, 51], [72, 45], [78, 46], [70, 39], [72, 51]] },
    ],
    tasks: {
        panel: [[2, 8], [63, 2], [86, 20], [14, 36], [49, 24], [33, 52], [80, 40]],
        label: [[24, 7], [53, 14], [7, 26], [32, 23], [59, 24], [16, 50], [46, 46]],
        loading: [[70, 51], [66, 46], [60, 46], [85, 35], [2, 51], [40, 52], [74, 45]],
    },
    lights: [[20, 7], [52, 8], [70, 8], [7, 26], [32, 27], [59, 27], [77, 27], [15, 45], [46, 45], [72, 45]],
};

const arcade: MapDef = {
    id: 'arcade', name: 'Seaside Arcade', theme: 'arcade', cols: 88, rows: 54, roundSeconds: 240,
    blurb: 'Neon halls, a sleepy café, maintenance tunnels and a boardwalk out to the pier.',
    districts: [
        { name: 'Maintenance Corridor', rect: [1, 1, 86, 3], floor: 'metal' },
        { name: 'Neon Hall', rect: [1, 5, 30, 18], floor: 'neon' },
        { name: 'Prize Counter', rect: [32, 5, 18, 18], floor: 'neon' },
        { name: 'Retro Room', rect: [51, 5, 22, 18], floor: 'neon' },
        { name: 'Workshop', rect: [74, 14, 13, 9], floor: 'metal' },
        { name: 'Souvenir Shop', rect: [1, 24, 22, 14], floor: 'wood' },
        { name: 'Seaside Café', rect: [24, 24, 26, 14], floor: 'tile' },
        { name: 'Bumper Car Rink', rect: [51, 24, 22, 14], floor: 'rink' },
        { name: 'Generator Room', rect: [74, 24, 13, 14], floor: 'metal' },
        { name: 'Boardwalk', rect: [1, 39, 81, 9], floor: 'planks' },
        { name: 'Beach', rect: [1, 48, 81, 5], floor: 'sand' },
        { name: 'Pier Gate', rect: [83, 40, 4, 7], floor: 'planks' },
        { name: 'Staff Room', rect: [74, 5, 13, 8], floor: 'tile', quiet: true },
    ],
    doors: [
        [8, 4, 2, 1], [26, 4, 2, 1], [40, 4, 2, 1], [60, 4, 2, 1], [70, 4, 2, 1],
        [31, 9, 1, 3], [31, 17, 1, 3], [50, 8, 1, 3], [50, 16, 1, 3], [73, 17, 1, 3],
        [10, 23, 3, 1], [27, 23, 3, 1], [40, 23, 3, 1], [58, 23, 3, 1], [79, 23, 3, 1],
        [23, 28, 1, 4], [50, 27, 1, 3], [50, 34, 1, 2], [73, 30, 1, 3],
        [6, 38, 3, 1], [18, 38, 3, 1], [33, 38, 4, 1], [45, 38, 3, 1], [60, 38, 3, 1], [77, 38, 3, 1],
    ],
    optional: [[20, 4, 2, 1], [54, 4, 2, 1], [31, 13, 1, 2], [50, 12, 1, 2], [23, 34, 1, 2], [15, 23, 3, 1], [46, 23, 3, 1], [67, 23, 3, 1], [26, 38, 3, 1], [68, 38, 3, 1], [73, 25, 1, 2]],
    blocks: [
        { rect: [4, 8, 8, 1], look: 'machines' }, { rect: [16, 8, 8, 1], look: 'machines' }, { rect: [4, 13, 8, 1], look: 'machines' }, { rect: [16, 13, 8, 1], look: 'machines' }, { rect: [4, 18, 8, 1], look: 'machines' }, { rect: [16, 18, 8, 1], look: 'machines' },
        { rect: [35, 8, 12, 2], look: 'counter' }, { rect: [35, 15, 1, 5], look: 'shelf' }, { rect: [46, 15, 1, 5], look: 'shelf' },
        { rect: [54, 7, 1, 6], look: 'machines' }, { rect: [60, 7, 1, 6], look: 'machines' }, { rect: [66, 7, 1, 6], look: 'machines' }, { rect: [54, 16, 1, 5], look: 'machines' }, { rect: [60, 16, 1, 5], look: 'machines' }, { rect: [66, 16, 1, 5], look: 'machines' },
        { rect: [74, 13, 5, 1], look: 'wall' }, { rect: [82, 13, 5, 1], look: 'wall' },
        { rect: [76, 16, 3, 2], look: 'crates' }, { rect: [83, 18, 3, 2], look: 'crates' }, { rect: [80, 21, 6, 1], look: 'shelf' },
        { rect: [4, 27, 7, 1], look: 'shelf' }, { rect: [13, 27, 7, 1], look: 'shelf' }, { rect: [4, 31, 7, 1], look: 'shelf' }, { rect: [13, 31, 7, 1], look: 'shelf' }, { rect: [8, 35, 6, 1], look: 'counter' },
        { rect: [27, 27, 2, 2], look: 'table' }, { rect: [32, 27, 2, 2], look: 'table' }, { rect: [37, 27, 2, 2], look: 'table' }, { rect: [42, 27, 2, 2], look: 'table' },
        { rect: [27, 33, 2, 2], look: 'table' }, { rect: [32, 33, 2, 2], look: 'table' }, { rect: [37, 33, 2, 2], look: 'table' }, { rect: [42, 33, 2, 2], look: 'table' }, { rect: [45, 24, 4, 2], look: 'counter' },
        { rect: [55, 27, 6, 1], look: 'railing' }, { rect: [63, 27, 6, 1], look: 'railing' }, { rect: [55, 35, 6, 1], look: 'railing' }, { rect: [63, 35, 6, 1], look: 'railing' },
        { rect: [55, 28, 1, 3], look: 'railing' }, { rect: [55, 32, 1, 3], look: 'railing' }, { rect: [68, 28, 1, 3], look: 'railing' }, { rect: [68, 32, 1, 3], look: 'railing' },
        { rect: [77, 27, 2, 3], look: 'machines' }, { rect: [82, 27, 2, 3], look: 'machines' }, { rect: [77, 33, 6, 1], look: 'crates' },
        { rect: [12, 41, 3, 2], look: 'booth' }, { rect: [36, 41, 3, 2], look: 'booth' }, { rect: [60, 41, 3, 2], look: 'booth' },
        { rect: [1, 48, 10, 1], look: 'railing' }, { rect: [14, 48, 20, 1], look: 'railing' }, { rect: [37, 48, 20, 1], look: 'railing' }, { rect: [60, 48, 22, 1], look: 'railing' },
    ],
    staging: [74, 5, 13, 8], gate: [79, 13, 3, 1], exitZone: [83, 40, 4, 7], exitDoor: [82, 41, 1, 5], spawn: [25, 29, 18, 4],
    props: [
        { kinds: ['cabinet', 'cabinet2', 'claw', 'stool', 'bin'], pick: 10, spots: [[2, 6], [14, 6], [28, 6], [2, 11], [14, 11], [28, 11], [2, 16], [14, 16], [28, 16], [2, 21], [14, 21], [28, 21], [13, 10]] },
        { kinds: ['claw', 'claw', 'plant', 'bin', 'parcel'], pick: 7, spots: [[33, 6], [48, 6], [33, 12], [48, 12], [38, 12], [44, 12], [33, 21], [48, 21], [40, 18], [43, 20]] },
        { kinds: ['cabinet', 'cabinet2', 'stool', 'bin'], pick: 9, spots: [[52, 6], [71, 6], [52, 21], [71, 21], [57, 10], [63, 10], [69, 10], [57, 19], [63, 19], [69, 19], [57, 14], [63, 14]] },
        { kinds: ['crate', 'parcel', 'bin', 'crate'], pick: 4, spots: [[75, 15], [86, 15], [75, 22], [86, 22], [80, 17], [78, 20]] },
        { kinds: ['parcel', 'plant', 'buoy', 'bin', 'crate'], pick: 7, spots: [[2, 25], [21, 25], [2, 36], [21, 36], [8, 29], [16, 29], [8, 33], [16, 33], [11, 25]] },
        { kinds: ['chair', 'chair', 'stool', 'plant', 'bin'], pick: 7, spots: [[25, 25], [35, 25], [40, 25], [25, 36], [30, 36], [35, 36], [40, 36], [48, 30], [48, 36], [30, 25]] },
        { kinds: ['bin', 'bench', 'plant', 'buoy', 'stool'], pick: 6, spots: [[52, 25], [72, 25], [52, 37], [72, 37], [60, 31], [64, 31], [58, 29], [66, 33]] },
        { kinds: ['crate', 'crate', 'parcel', 'bin'], pick: 4, spots: [[75, 25], [86, 25], [75, 37], [86, 37], [80, 30], [84, 31]] },
        { kinds: ['bench', 'bin', 'plant', 'buoy', 'umbrella', 'lantern'], pick: 10, spots: [[3, 40], [10, 45], [20, 40], [28, 45], [42, 40], [50, 45], [56, 40], [66, 45], [72, 40], [78, 45], [16, 44], [46, 43], [30, 40]] },
        { kinds: ['umbrella', 'umbrella', 'buoy', 'bin'], pick: 7, spots: [[3, 50], [12, 51], [20, 50], [30, 51], [40, 50], [48, 51], [56, 50], [66, 51], [74, 50], [80, 51]] },
    ],
    tasks: {
        panel: [[30, 6], [3, 2], [85, 2], [49, 20], [86, 26], [22, 26], [72, 14]],
        label: [[11, 10], [41, 12], [63, 12], [12, 29], [36, 25], [62, 31], [40, 44]],
        loading: [[80, 44], [70, 36], [45, 2], [86, 21], [3, 46], [25, 51], [52, 51]],
    },
    lights: [[15, 11], [41, 13], [62, 13], [80, 18], [11, 30], [37, 30], [62, 31], [80, 31], [20, 43], [50, 43], [74, 43]],
};

export const MAP_DEFS: MapDef[] = [museum, market, arcade];
export const mapDef = (id: string) => MAP_DEFS.find(m => m.id === id) ?? MAP_DEFS[0];
const cache = new Map<string, Layout>();
/** Layouts are deterministic, so both server and clients build and cache them from (map, seed). */
export function layoutFor(id: string, seed: number) {
    const key = id + ':' + seed;
    let l = cache.get(key);
    if (!l) { l = buildLayout(mapDef(id), seed); cache.set(key, l); if (cache.size > 12) cache.delete(cache.keys().next().value!); }
    return l;
}
