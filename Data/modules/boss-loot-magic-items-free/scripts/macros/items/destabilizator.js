import { MODULE_NAME, SHORT_MODULE_NAME } from "../../constants.js";
import { helperData as helpers } from "../../helperFunctions.js";
import { utils } from "../../utils.js";
import { log } from "../../boss-loot-log.js";

//------------------------
// L O C A L    F U N C T I O N S
//-----------
async function pushTokenToNewLocation(targetToken, newLocation) {
  await new Sequence()
    .animation()
    .on(targetToken)
    .fadeIn(500)
    .moveSpeed(5)
    .moveTowards(newLocation, { duration: 1, ease: "easeOutQuint", delay: 0, offset: 0 })
    .play();
}

async function hammerHit(sourceToken, targetToken) {
  const elevation = targetToken.document.elevation;
  await new Sequence()
    .effect()
    .file("jb2a.side_impact.part.shockwave.blue")
    .elevation(elevation)
    .atLocation(targetToken)
    .attachTo(sourceToken, { followRotation: false })
    .rotateTowards(targetToken, { attachTo: true })
    .scale(0.3)
    .delay(-7000)

    .effect()
    .file("jb2a.impact.006.yellow")
    .elevation(elevation)
    .atLocation(targetToken)
    .scaleToObject(2)
    .delay(0)
    .waitUntilFinished(-2000)

    .effect()
    .file("jb2a.impact.ground_crack.orange.01")
    .filter("ColorMatrix", { brightness: 1, contrast: 0 })
    .template({ gridSize: 200, startPoint: 200, endPoint: 200 })
    .atLocation(targetToken)
    .scaleToObject(2)
    .delay(10)
    .fadeOut(1000)
    .elevation(elevation, { absolute: true })

    .play();
}

async function itemAfterActiveEffects({ speaker, actor, token, character, item, args, scope, workflow }) {
  const itemNameNormalized = helpers.normalizeItemName(item.name);
  const strLimit = 16;
  const abilityName = "Destabilizing Attack";
  const permittedSize = ["tiny", "sm", "med", "lg"];
  const artWorkChatCardStatic = `modules/${MODULE_NAME}/artwork/007-destabilizator/art-static-destabilizator.webp`;
  const artWorkChatCardAnimated = `modules/${MODULE_NAME}/artwork/007-destabilizator/art-animated-for-chat-destabilizator.gif`;

  const info = args[0];
  const actorStr = actor.system.abilities.str.value;

  // await helpers.hideDivFromChatMessage(workflow.itemCardId, "#boss-loot-destabilizator");
  await helpers.replaceChatArtwork(workflow.itemCardId, artWorkChatCardAnimated);

  //------------------------
  // Pre-Checks
  //-----------
  if (info.targets.length === 0 || info.targetUuids.length === 0) {
    log("No target to hit", itemNameNormalized);
    return;
  }

  if (info.workflow.hitTargets.size === 0) {
    log("Misses target", itemNameNormalized);
    return;
  }

  if (info.failedSaveUuids.length === 0) {
    log("Saving throw succeded", itemNameNormalized);
  }

  if (info.item.system.attunement !== CONFIG.DND5E.attunementTypes.ATTUNED) {
    ui.notifications.warn(`You cannot use <strong>${abilityName}</strong> without attunement!`);
    return;
  }

  if (actorStr < strLimit) {
    ui.notifications.warn(`You don't have enough STR to use <strong>${abilityName}!</strong>`);
    return;
  }

  if (item.system.rarity === "uncommon") {
    // Remove 'large' from the list of permitted sizes for uncommon items
    permittedSize.pop();
    log("Remove 'large' from the list of permitted sizes for uncommon item!", itemNameNormalized);
  }

  //------------------------
  // M A I N
  //-----------
  const [target] = info.targets; // TokenDocument5e
  const [targetToken] = Array.from(workflow.targets); // Token
  const targetSize = target.actor.system?.traits?.size;
  let messageBot;

  if (!permittedSize.includes(targetSize.toLowerCase())) {
    messageBot = "<p>You swing with all your might, but the target's colossal size is too much for even your warhammer's power!</p>";
    await helpers.createChatMessage("Failed", messageBot, abilityName, artWorkChatCardStatic, artWorkChatCardAnimated);
    await hammerHit(token, targetToken);
    return;
  }

  if (info.failedSaveUuids.length === 0) {
    messageBot = "<p>With a swift maneuver, the target withstands your hammer's blow, staying steadfast against your attempt to push them back!</p>";
    await helpers.createChatMessage("Failed", messageBot, abilityName, artWorkChatCardStatic, artWorkChatCardAnimated);
    await hammerHit(token, targetToken);
    return;
  }

  const newTargetLoc = utils.moveTokenWithForce(token, targetToken, 5, itemNameNormalized);

  // Check for success
  const targetMoved = targetToken.x !== newTargetLoc.x || targetToken.y !== newTargetLoc.y;
  const messageTop = targetMoved ? "Success" : "Failed";

  if (targetMoved) {
    messageBot = "<p>The force of your swing sends the target flying back 5 feet!</p>";
  } else {
    messageBot = "<p>The surroundings block the force of your blow, preventing you from pushing the target away.</p>";
  }

  await helpers.createChatMessage(messageTop, messageBot, abilityName, artWorkChatCardStatic, artWorkChatCardAnimated);

  await hammerHit(token, targetToken);

  if (targetMoved) {
    await pushTokenToNewLocation(targetToken, newTargetLoc);
  }
}

export const destabilizator = {
  itemAAE: itemAfterActiveEffects,
};
