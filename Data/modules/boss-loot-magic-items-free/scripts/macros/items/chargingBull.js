import { MODULE_NAME, SHORT_MODULE_NAME } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';
import { utils } from '../../utils.js';
import { log } from '../../boss-loot-log.js';

//------------------------
// F U N C T I O N S
//-----------
async function chargeAnimation(chargingToken, targetToken) {
  const elevation = chargingToken.document.elevation;
  await new Sequence()
    // Charge
    .animation()
    .on(chargingToken)
    .moveTowards(targetToken, { ease: 'easeInOutBack' })
    .moveSpeed(15)
    .waitUntilFinished(-300)
    .closestSquare()
    .effect()
    .file('jb2a.wind_stream.white')
    .timeRange(0, 400)
    .atLocation(chargingToken, { cacheLocation: true })
    .stretchTo(targetToken, { cacheLocation: true })
    .scale({ x: 1, y: 0.2 })
    .elevation(elevation, { absolute: true })
    .play();
}

async function thrownAnimation(chargingToken, targetPosition) {
  const elevation = chargingToken.document.elevation;
  await new Sequence()
    //Start dust under token
    .effect()
    .file('jb2a.smoke.puff.ring.01.white.0')
    .atLocation(chargingToken)
    .scaleToObject(1.75)
    .elevation(elevation, { absolute: true })
    .waitUntilFinished(-1000)
    //Turn token invisible
    .animation()
    .on(chargingToken)
    .opacity(0)
    .teleportTo(targetPosition)
    //Token jump
    .effect()
    .from(chargingToken)
    .atLocation(chargingToken)
    .elevation(elevation)
    .scale(1.5)
    .scaleIn({ x: 0.5, y: 0.5 }, 250, { ease: 'easeOutCubic' })
    .scaleOut({ x: 0.5, y: 0.5 }, 450, { ease: 'easeInCubic' })
    .opacity(1)
    .duration(800)
    .anchor({ x: 0.5, y: 0.5 })
    .loopProperty('sprite', 'rotation', { from: 0, to: 360, duration: 800, ease: 'easeOutQuad' })
    .moveTowards(targetPosition, { rotate: false, ease: 'easeOutSine' })
    .zIndex(2)
    //Token shadow
    .effect()
    .from(chargingToken)
    .atLocation(chargingToken)
    .elevation(elevation)
    .opacity(0.5)
    .scale(0.9)
    .duration(800)
    .anchor({ x: 0.5, y: 0.1 })
    .filter('ColorMatrix', { brightness: -1 })
    .filter('Blur', { blurX: 5, blurY: 10 })
    .loopProperty('sprite', 'rotation', { from: 0, to: 360, duration: 800, ease: 'easeOutCirc' })
    .moveTowards(targetPosition, { rotate: false, ease: 'easeOutSine' })
    .zIndex(2)
    .waitUntilFinished(-100)
    //End dust under token
    .effect()
    .file('jb2a.smoke.puff.ring.01.white.2')
    .elevation(elevation)
    .atLocation(chargingToken)
    .scaleToObject(1.75)
    .effect()
    .file('jb2a.smoke.puff.ring.01.white.1')
    .elevation(elevation)
    .atLocation(chargingToken)
    .effect()
    .file('jb2a.smoke.puff.side.02.white.0')
    .elevation(elevation)
    .atLocation(chargingToken)
    .rotateTowards(chargingToken, { rotationOffset: 180, cacheLocation: true })
    .scaleToObject(2.5)
    //Turn token visible
    .animation()
    .on(chargingToken)
    .opacity(1)
    .delay(200)
    .play();
}

async function itemPreItemRoll({ speaker, actor, token, character, item, args, scope, workflow }) {
  const targets = Array.from(workflow.targets);
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const requiredStr = 14;

  //------------------------
  // P R E - C H E C K S
  //-----------
  if (actor.system.abilities.str.value < requiredStr) {
    log(`To use this item you need to have at least ${requiredStr} Strength`, itemNameNormalized, 'warn');
    ui.notifications.warn(`To use this item you need to have at least ${requiredStr} Strength`);
    return false;
  }

  if (targets.length !== 1) {
    log('Please select one target', itemNameNormalized, 'warn');
    ui.notifications.warn(`Please select one target!`);
    return false;
  }

  const [targetToken] = targets;

  if (targetToken.document.uuid === token.document.uuid) {
    log('Cannot use the item on yourself', itemNameNormalized, 'warn');
    ui.notifications.warn(`Cannot use the item ${itemNameNormalized} on yourself!`);
    return false;
  }

  // Check the distance
  const ray = new Ray({ x: token.center.x, y: token.center.y }, { x: targetToken.center.x, y: targetToken.center.y });
  const collision = helpers.testCollision(ray.A, ray.B, { type: 'move', mode: 'any' });
  const [distanceFeet] = canvas.grid.measureDistances([{ ray }], { gridSpaces: true });
  if (collision) {
    log('You cannot charge through walls', itemNameNormalized, 'warn');
    ui.notifications.warn(`You cannot charge through walls`);
    return false;
  }
  if (distanceFeet < 20) {
    log(`You need to charge at least 20 feet to the target (${distanceFeet}ft)`, itemNameNormalized, 'warn');
    ui.notifications.warn(`You need to charge at least 20 feet to the target`);
    return false;
  }
}

async function itemPostActiveEffects({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const info = args[0];
  const targetUuid = info.targetUuids;
  const permittedSize = ['tiny', 'sm', 'med'];
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/011-helm-of-the-charging-bull/art-animated-for-chat-helm-of-the-charging-bull.gif`;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/011-helm-of-the-charging-bull/art-static-helm-of-the-charging-bull.webp`;

  // Delete the Template
  if (workflow.templateId) {
    await canvas.scene.deleteEmbeddedDocuments('MeasuredTemplate', [workflow.templateId]);
  }

  //------------------------
  // M A I N
  //------------------------
  const [targetToken] = Array.from(workflow.targets);
  const failedSaves = Array.from(workflow.failedSaves);
  const targetSize = targetToken.document.actor.system?.traits?.size;

  //   await helpers.hideDivFromChatMessage(info.itemCardId, '#img-static-helm-of-the-charging-bull');
  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);
  await chargeAnimation(token, targetToken);

  if (!permittedSize.includes(targetSize.toLowerCase())) {
    return;
  }

  const newTargetLoc = utils.moveTokenWithForce(token, targetToken, 15, itemNameNormalized);

  if (failedSaves.length > 0) {
    await thrownAnimation(targetToken, newTargetLoc);

    const incapacitatedEffectData = game.dfreds.effectInterface.findEffectByName('Stunned').toObject();
    incapacitatedEffectData.flags.dae = {
      transfer: false,
      specialDuration: ['turnEnd'],
      stackable: 'multi',
      macroRepeat: 'none',
    };

    await game.dfreds.effectInterface.addEffect({ effectName: 'Prone', uuid: targetUuid[0], origin: info.item.uuid });
    await game.dfreds.effectInterface.addEffectWith({ effectData: incapacitatedEffectData, uuid: targetUuid[0], origin: info.item.uuid });
  }
}

export const chargingBull = {
  itemPIR: itemPreItemRoll,
  itemPAE: itemPostActiveEffects,
};
