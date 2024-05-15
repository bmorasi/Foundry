import { MODULE_NAME, SHORT_MODULE_NAME, SELECT_ONE_TARGET } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';

async function playBowAttack(sourceToken, targetToken) {
  const sourceElevation = sourceToken.document.elevation;
  const targetElevation = targetToken.document.elevation;
  await new Sequence()

    //BOW_ARROW_DRAWING
    .effect()
    .file('bossLoot.weapon.range.bow.void_vortex.attack')
    .elevation(sourceElevation)
    .filter('Glow', {
      outerStrength: 1,
      innerStrength: 0,
      distance: 10,
      color: 0x0096ff,
    })
    .atLocation(sourceToken)
    .rotateTowards(targetToken)
    .spriteScale(0.15)
    .center()
    .spriteOffset({ x: sourceToken.document.width * 0.3 }, { gridUnits: true })
    .waitUntilFinished(-500)

    //VORTEX_ARROW
    .effect()
    .file('bossLoot.spell.range.arrow.arcane_shot.blue')
    .elevation(targetElevation)
    .atLocation(sourceToken)
    .stretchTo(targetToken)
    .waitUntilFinished(-300)

    .play();
}

//------------------------
// M A I N
//-----------
async function item({ speaker, actor, token, character, item, args, scope, workflow }) {
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/002-void-vortex/art-animated-for-chat-vortex-arrow.gif`;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/002-void-vortex/art-static-void-vortex.webp`;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);

  if (workflow.targets.size !== 1) {
    ui.notifications.warn(SELECT_ONE_TARGET);
    return;
  }

  const [target] = Array.from(workflow.targets);
  await playBowAttack(token, target);
}

export const voidVortex = {
  item: item,
};
