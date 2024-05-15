import { MODULE_NAME, SHORT_MODULE_NAME } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';
import { voidVortexAbility } from '../../items/voidVortexAbility.js';
import { socket } from '../../bossLoot.js';
import { log } from '../../boss-loot-log.js';

async function featTemplatePlaced({ speaker, actor, token, character, item, args, scope, workflow }) {
  const info = args[0];
  const templateDocument = canvas.scene.templates.get(info.templateId);
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/002-void-vortex/art-animated-for-chat-vortex-arrow.gif`;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/002-void-vortex/art-static-void-vortex.webp`;
  const elevation = token.document.elevation;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated, artWorkChatCardStatic);

  await new Sequence()

    //BOW_ARROW_DRAWING
    .effect()
    .file('blfx.weapon.range.bow1.physical.shot.attack1.blue')
    .filter('Glow', {
      outerStrength: 1,
      innerStrength: 0,
      distance: 10,
      color: 0x0096ff,
    })
    .atLocation(token)
    .elevation(elevation)
    .rotateTowards({ x: templateDocument.x, y: templateDocument.y }, { cacheLocation: true })
    // .rotate(token.angle)
    .spriteScale(0.15)
    .center()
    .spriteOffset({ x: token.document.width * 0.3 }, { gridUnits: true })
    .waitUntilFinished(-500)

    //VORTEX_ARROW
    .effect()
    .file('blfx.weapon.range.snipe.arrow1.physical.impact1.blue')
    .atLocation(token)
    .elevation(elevation)
    .stretchTo({ x: templateDocument.x, y: templateDocument.y }, { cacheLocation: true })
    .waitUntilFinished(-300)

    //EXPLOSION
    .effect()
    .file('blfx.spell.impact.explosion1.smoke1.purple')
    .filter('Glow', {
      outerStrength: 1,
      innerStrength: 0,
      distance: 10,
      color: 0x0096ff,
    })
    .atLocation(templateDocument)
    .scaleToObject(2)
    .elevation(elevation)

    //VORTEX
    .effect()
    .file('blfx.spell.template.circle.tornado2.vortex1.hole.clockwise.loop.black')
    .atLocation(templateDocument)
    .scaleIn(0, 500, { ease: 'easeOutQuad' })
    .tieToDocuments(templateDocument)
    .scaleToObject(1.5)
    .elevation(elevation, { absolute: true })
    .fadeOut(500)
    .fadeIn(250, { ease: 'easeInSine' })
    .persist()

    //SCREEN_SHAKE
    .canvasPan()
    .shake({
      duration: 1000,
      strength: 4,
      rotation: true,
      fadeInDuration: 0,
      fadeOutDuration: 500,
    })

    .play();
}

async function featPostSave({ speaker, actor, token, character, item, args, scope, workflow }) {
  const info = args[0];
  const templ = canvas.scene.templates.get(info.templateId);
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const canvasGridSize = canvas.scene.grid.size;
  const tokensToMove = Array.from(workflow.failedSaves);

  if (tokensToMove.length === 0) {
    log('No tokens in failedSaves', itemNameNormalized);
    return;
  }

  const incapacitatedEffectData = game.dfreds.effectInterface.findEffectByName('Incapacitated').toObject();
  incapacitatedEffectData.flags.dae = {
    transfer: false,
    specialDuration: ['turnStartSource'],
  };
  incapacitatedEffectData.flags.effectmacro = {
    onDelete: {
      script:
        'await bossLoot.macros.vortexArrowFeat.effectDelete({token: arguments[0], actor:arguments[2], speaker: arguments[3], scene: arguments[4], effect: arguments[6]})',
    },
  };
  incapacitatedEffectData.duration.seconds = game.combat?.active ? null : 6;

  tokensToMove.forEach(async targetToken => {
    const randomizeX = Math.floor(Math.random() * canvasGridSize * helpers.randomInt(-1, 1));
    const randomizeY = Math.floor(Math.random() * canvasGridSize * helpers.randomInt(-1, 1));

    const newTokenPos = { x: templ.x - randomizeX, y: templ.y - randomizeY };

    new Sequence()
      .animation()
      .on(targetToken)
      .fadeIn(500)
      .moveSpeed(5)
      .rotateTowards(newTokenPos)
      .moveTowards(newTokenPos, { duration: 1, ease: 'easeInQuint', delay: 0, offset: 0 })
      .play();

    // Apply Incapacitated on each Token
    const isIncapacitated = game.dfreds.effectInterface.hasEffectApplied('Incapacitated', targetToken.actor.uuid);
    if (!isIncapacitated) {
      await game.dfreds.effectInterface.addEffectWith({ effectData: incapacitatedEffectData, uuid: targetToken.actor.uuid, origin: item.uuid });
    }

    // Toggle token visibility
    await socket.executeAsGM('toggleTokenVisibility', { tokenUuid: targetToken.document.uuid, hidden: true });
  });
}

// (token,character,actor,speaker,scene,origin,effect,item)
async function effectDelete({ token, actor, speaker, scene, effect }) {
  await socket.executeAsGM('toggleTokenVisibility', { tokenUuid: token.document.uuid, hidden: false });
  const { x, y } = canvas.grid.getSnappedPosition(token.document.x, token.document.y);
  await token.document.update({ x, y }, { animate: false });
}

async function effectOnOff({ speaker, actor, token, character, args, item, scope }) {
  const featName = 'Vortex Arrow (Active Ability)';

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

    const vortexArrow = foundry.utils.deepClone(voidVortexAbility.vortexArrow);

    // Customize the Active Ability
    vortexArrow.system.source = item.name;
    vortexArrow.system.description.value = helpers.extractInnerHTMLById(item.system.description.value, 'bossLootVortexArrowAbility');
    vortexArrow.flags['midi-qol'].onUseMacroName =
      '[postActiveEffects]function.bossLoot.macros.vortexArrowFeat.featPS,[templatePlaced]function.bossLoot.macros.vortexArrowFeat.featTP';

    if (itemRarity === 'rare') {
      vortexArrow.effects = [];
      vortexArrow.system.duration.value = '';
      vortexArrow.system.duration.units = 'inst';
      vortexArrow.system.damage.parts[0][0] = '4d8';
      vortexArrow.flags['midi-qol'].onUseMacroName = '[templatePlaced]function.bossLoot.macros.vortexArrowFeat.featTP';
    }

    await actor.createEmbeddedDocuments('Item', [vortexArrow]);
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

export const vortexArrowFeat = {
  featTP: featTemplatePlaced,
  featPS: featPostSave,
  effectDelete: effectDelete,
  effectOnOff: effectOnOff,
};
