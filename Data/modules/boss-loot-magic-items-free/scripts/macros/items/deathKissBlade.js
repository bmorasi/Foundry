import { MODULE_NAME, SHORT_MODULE_NAME, SELECT_ONE_TARGET } from '../../constants.js';
import { helperData as helpers } from '../../helperFunctions.js';
import { log } from '../../boss-loot-log.js';

//------------------------
// M A I N
//-----------
async function item({ speaker, actor, token, character, item, args, scope, workflow }) {
  const info = args[0];
  let targetTokens = info.targets;
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/009-death-kiss-blade/art-animated-for-chat-death-kiss-blade.gif`;
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/009-death-kiss-blade/art-static-death-kiss-blade.webp`;

  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);

  if (targetTokens.length !== 1) {
    log('Please select one target', itemNameNormalized, 'warn');
    ui.notifications.warn(SELECT_ONE_TARGET);
    return;
  }

  const [target] = targetTokens;

  new Sequence()
    .effect()
    .file('jb2a.greatsword.melee.standard.white')
    .atLocation(token)
    .stretchTo(target)
    .template({ gridSize: 200, startPoint: 200, endPoint: 200 })
    .timeRange(1400, 2500)
    .play();
}

export const deathKissBlade = {
  item: item,
};
