import { MODULE_NAME, SHORT_MODULE_NAME } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';
import { deathKissAbility } from '../../items/deathKissAbility.js';
import { log } from '../../boss-loot-log.js';

async function itemFeat({ speaker, actor, token, character, item, args, scope, workflow }) {
  const info = args[0];
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/009-death-kiss-blade/art-animated-for-chat-death-kiss-blade.gif`;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/009-death-kiss-blade/art-static-death-kiss-blade.webp`;

  if (info.targets.length === 0) {
    log('No hits', itemNameNormalized);
    return;
  }

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated, artWorkChatCardStatic);

  // Making a copy to not alter the original array
  const targets = Array.from(info.targets);
  targets.unshift(token.document);

  const seq = new Sequence();

  for (let t = 0; t < targets.length; t++) {
    if (t == targets.length - 1) {
      break;
    }
    log(`Now attacking ${targets[t + 1].name}`, itemNameNormalized);

    await seq
      .animation()
      .on(token)
      .fadeOut(150)

      .effect()
      .file('jb2a.gust_of_wind.veryfast')
      .endTime(380)
      .filter('ColorMatrix', { hue: 115 })
      .atLocation(targets[t], { cacheLocation: true })
      .stretchTo(targets[t + 1], { cacheLocation: true })
      .waitUntilFinished(-500)

      .effect()
      .file('jb2a.greatsword.melee.standard.white')
      .spriteScale(0.5)
      .randomRotation()
      .template({ gridSize: 200, startPoint: 200, endPoint: 200 })
      .timeRange(1400, 2000)
      .atLocation(targets[t + 1], { cacheLocation: true })
      .waitUntilFinished(-500);
  }

  await seq
    .effect()
    .file('jb2a.gust_of_wind.veryfast')
    .endTime(380)
    .filter('ColorMatrix', { hue: 115 })
    .atLocation(targets[targets.length - 1], { cacheLocation: true })
    .stretchTo(targets[0], { cacheLocation: true })
    .waitUntilFinished(-500)

    .animation()
    .on(token)
    .fadeIn(100)

    .effect()
    .file('jb2a.static_electricity.03.blue')
    .filter('ColorMatrix', { hue: 190 })
    .atLocation(token)
    .scaleToObject()
    .play();
}

async function effectOnOff({ speaker, actor, token, character, args, item, scope }) {
  const featName = 'Death Kiss Attack (Active Ability)';

  if (args[0] === 'on') {
    if (!item) {
      log('Cannot fetch the source item!', '', 'warn');
      return;
    }

    const itemRarity = item.system.rarity;
    const featExists = actor.items.some(item => item.name === featName && item.type === 'feat');

    if (featExists) {
      log(`A feature with name ${featName} already exists`);
      return;
    }

    const deathKissAttack = foundry.utils.deepClone(deathKissAbility.deathKissAttack);

    // Customize the Active Ability
    deathKissAttack.system.source = item.name;
    deathKissAttack.system.description.value = helpers.extractInnerHTMLById(item.system.description.value, 'bossLootDeathKissAbility');
    deathKissAttack.flags['midi-qol'].onUseMacroName = '[postAttackRoll]function.bossLoot.macros.deathKissAttack.itemFeat';

    if (itemRarity === 'rare') {
      deathKissAttack.system.uses.value = 1;
      deathKissAttack.system.uses.max = '1';
      deathKissAttack.system.attackBonus = '1';
      deathKissAttack.system.damage.parts = [['1d8 + @mod + 1', 'slashing']];
    }
    await actor.createEmbeddedDocuments('Item', [deathKissAttack]);
  }

  if (args[0] === 'off') {
    let myItems = actor.items;

    // Get the IDs of items to be removed
    const itemsToRemove = myItems.filter(item => item.name === featName && item.type === 'feat').map(item => item.id);

    // Remove the items
    if (itemsToRemove.length > 0) {
      log(`Deleting feat ${featName}`);
      await actor.deleteEmbeddedDocuments('Item', itemsToRemove);
    }
  }
}

export const deathKissAttack = {
  itemFeat: itemFeat,
  effectOnOff: effectOnOff,
};
