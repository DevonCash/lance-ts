/**
 * This class implements a singleton game world instance, created by Lance.
 * It represents an instance of the game world, and includes all the game objects.
 * It is the state of the game.
 */

import GameObject from "./serialize/GameObject";

export type GameObjectRef = GameObject | number;

export interface WorldSettings {
    idSpace: number;
}

class GameWorld extends Array<GameObject>{

    stepCount = 0;
    playerCount = 0;

    private idCount = 0;
    private _index = {};

    constructor(options: WorldSettings) {
        super();
        if (options.idSpace)
            this.idCount = options.idSpace;
    }

    getNewId(): number {
        let possibleId = this.idCount;
        // find a free id
        while (possibleId in this._index)
            possibleId++;

        this.idCount = possibleId + 1;
        return possibleId;
    }

    get(ref: GameObjectRef) {
        if (typeof ref === 'string') ref = parseInt(ref, 10);
        if (typeof ref !== 'number') ref = ref.id;
        return this._index[ref];
    }

    has(ref: GameObjectRef) {
        return !!this.get(ref);
    }

    push(object: GameObject): number {
        if (!object.id) {
            object.id = this.getNewId();
        }
        this._index[object.id] = object;
        return super.push(object)
    }

    delete(ref: GameObjectRef): GameObject {
        const obj = this.get(ref);
        this.splice(this.findIndex(x => x.id === obj.id), 1);
        delete this._index[obj.id];
        return obj;
    }

}

export default GameWorld;
