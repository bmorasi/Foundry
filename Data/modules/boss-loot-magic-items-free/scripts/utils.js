import { MODULE_NAME, SHORT_MODULE_NAME } from './constants.js';
import { helperData as helpers } from './helperFunctions.js';
import { log } from './boss-loot-log.js';

export const utils = {
  /**
   * Dynamically moves a target token, simulating a forceful push or throw based on a specified distance relative to a source token.
   *
   * @param {Token} sourceToken - The token initiating the action, representing the attacker or source of the force.
   * @param {Token} targetToken - The token being moved, typically the recipient of the action.
   * @param {number} distanceUnits - The number of grid units the target token should be moved
   * @param {string} itemName - A normalized string identifying the item or effect causing the action, used for logging.
   * @return {Object} An object containing the x and y coordinates of the destination position for the target token.
   *
   */

  moveTokenWithForce: function _moveTokenWithForceV2(sourceToken, targetToken, distance, itemName) {
    const canvasGridDistance = canvas.dimensions.distance;
    let knockBackFactor = distance / canvasGridDistance;
    let ray = new Ray(sourceToken.center, targetToken.center);

    if (ray.distance === 0) {
      ui.notifications.info('Target is on the same spot as source and cannot be moved.');
      log('Target is on the same spot as source and cannot be moved.', itemName, 'warn');
      return { x: targetToken.x, y: targetToken.y };
    }

    let newCenter = ray.project(1 + (canvas.dimensions.size * knockBackFactor) / ray.distance);
    let hitsWall = targetToken.checkCollision(newCenter, { origin: ray.A, type: 'move', mode: 'any' });

    // Adjust distance if initial position is invalid
    while (hitsWall && Math.abs(distance) >= canvasGridDistance) {
      distance -= Math.sign(distance) * canvasGridDistance;
      knockBackFactor = distance / canvasGridDistance;
      newCenter = ray.project(1 + (canvas.dimensions.size * knockBackFactor) / ray.distance);
      hitsWall = targetToken.checkCollision(newCenter, { origin: ray.A, type: 'move', mode: 'any' });
    }

    if (hitsWall) {
      ui.notifications.info('No valid position found within the given distance.');
      log('No valid position found within the given distance.', itemName, 'warn');
      return { x: targetToken.x, y: targetToken.y };
    }

    // Snap new position to grid
    newCenter = canvas.grid.getSnappedPosition(newCenter.x - targetToken.w / 2, newCenter.y - targetToken.h / 2, 1);

    return newCenter;
  },
};
