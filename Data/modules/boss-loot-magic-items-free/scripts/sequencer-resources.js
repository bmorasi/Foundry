import { MODULE_NAME } from './constants.js';

/*
1. <type> {weapon, equipment, consumable, tool, spell}
2. <range> {melee, aoe, range, mechanical}
3. <item_type> {sword, hat, etc}
4. <item_name> {vengance, toyama, etc}
5. <action> {swing, stab}
6. <optional> {trail}
7. <optional_color> {color_name}
8. <optional_number> {01, 02, 03}
*/

export const database = {
  _templates: {
    // Grid size, start point, end point
    default: [200, 0, 0],
    ranged: [200, 200, 200],
    melee: [200, 300, 300],
  },

  equipment: {
    radial: {
      chain: {
        metal: {
          spin: {
            2: `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Chain_2_Round_1_METAL_1200x1200.webm`,
            3: `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Chain_3_Round_1_METAL_1200x1200.webm`,
          },
        },
      },
    },
    line: {
      chain: {
        metal: `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Chain_1_Line_1_METAL_1200x100.webm`,
      },
    },
  },
  
  weapon: {
    range: {
      arrow: {
        void_vortex: {
          _template: 'ranged',
          '05ft': `modules/${MODULE_NAME}/artwork/002-void-vortex/Vortex_Arrow_1_05ft_600x400.webm`,
          '15ft': `modules/${MODULE_NAME}/artwork/002-void-vortex/Vortex_Arrow_1_15ft_1000x400.webm`,
          '30ft': `modules/${MODULE_NAME}/artwork/002-void-vortex/Vortex_Arrow_1_30ft_1600x400.webm`,
          '60ft': `modules/${MODULE_NAME}/artwork/002-void-vortex/Vortex_Arrow_1_60ft_2800x400.webm`,
          '90ft': `modules/${MODULE_NAME}/artwork/002-void-vortex/Vortex_Arrow_1_90ft_4000x400.webm`,
        },
      },
      bow: {
        void_vortex: {
          ability: `modules/${MODULE_NAME}/artwork/002-void-vortex/Void_Vortex_Drawing_1_1500x1200.webm`,
          attack: `modules/${MODULE_NAME}/artwork/002-void-vortex/Void_Vortex_Drawing_2_1500x1200.webm`,
        },
      },
    },
  },
  spell: {
    range: {
      arrow: {
        arcane_shot: {
          blue: {
            _template: 'ranged',
            '05ft': `modules/${MODULE_NAME}/artwork/043-hat-of-arcane-armaments/Arrow_Arcane_Shot_Blue_1_05ft_600x400.webm`,
            '15ft': `modules/${MODULE_NAME}/artwork/043-hat-of-arcane-armaments/Arrow_Arcane_Shot_Blue_1_15ft_1000x400.webm`,
            '30ft': `modules/${MODULE_NAME}/artwork/043-hat-of-arcane-armaments/Arrow_Arcane_Shot_Blue_1_30ft_1600x400.webm`,
            '60ft': `modules/${MODULE_NAME}/artwork/043-hat-of-arcane-armaments/Arrow_Arcane_Shot_Blue_1_60ft_2800x400.webm`,
            '90ft': `modules/${MODULE_NAME}/artwork/043-hat-of-arcane-armaments/Arrow_Arcane_Shot_Blue_1_90ft_4000x400.webm`,
          },
        },
      },
      snipe: {
        burst: {
          dust: {
            _template: 'ranged',
            '05ft': `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Dust_1_Burst_1_Snipe_1_WHITE_RANGE_05ft_600x400.webm`,
            '15ft': `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Dust_1_Burst_1_Snipe_1_WHITE_RANGE_15ft_1000x400.webm`,
            '30ft': `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Dust_1_Burst_1_Snipe_1_WHITE_RANGE_30ft_1600x400.webm`,
            '60ft': `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Dust_1_Burst_1_Snipe_1_WHITE_RANGE_60ft_2800x400.webm`,
            '90ft': `modules/${MODULE_NAME}/artwork/003-chainweaver-bracer/Dust_1_Burst_1_Snipe_1_WHITE_RANGE_90ft_4000x400.webm`,
          },
        },
      },
    },
	explosion: {
		impact: {
			radial: {
				purple: `modules/${MODULE_NAME}/artwork/002-void-vortex/Explosion_2_Radial_PURPLE_1200x1200.webm`
			}
		},
		vortex: {
			hole: `modules/${MODULE_NAME}/artwork/002-void-vortex/Vortex_Hole_1_BLUE_PURPLE_1200x1200.webm`
		},
	},
  },
};
