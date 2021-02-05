import GameWorld, { GameObject, GameObjectRef, WorldSettings } from './GameWorld';
import EventEmitter from 'event-emitter';
import Timer from './game/Timer';
import Trace from './lib/Trace';
import PhysicsEngine from './physics/PhysicsEngine';

/**
 * The GameEngine contains the game logic.  Extend this class
 * to implement game mechanics.  The GameEngine derived
 * instance runs once on the server, where the final decisions
 * are always taken, and one instance will run on each client as well,
 * where the client emulates what it expects to be happening
 * on the server.
 *
 * The game engine's logic must listen to user inputs and
 * act on these inputs to change the game state.  For example,
 * the game engine listens to controller/keyboard inputs to infer
 * movement for the player/ship/first-person.  The game engine listens
 * to clicks, button-presses to infer firing, etc..
 *
 * Note that the game engine runs on both the server and on the
 * clients - but the server decisions always have the final say,
 * and therefore clients must resolve server updates which conflict
 * with client-side predictions.
 */

interface EngineOptions {
    traceLevel?: number;
    clientIDSpace?: number;
}

interface InputDescriptor {
    input?: string // describe the input(e.g. "up", "down", "fire")
    messageIndex?: number //input identifier
    step?: number // the step on which this input occurred
}


abstract class GameEngine<PE extends PhysicsEngine> implements EventEmitter.Emitter {
    options: EngineOptions;
    private _emitter: EventEmitter.Emitter;
    private objects: Map<number, GameObject> = new Map();
    playerId: number;
    trace: Trace;
    world: GameWorld;
    worldSettings: WorldSettings;
    timer: Timer;
    physicsEngine: PE;
    ignorePhysics: boolean;
    ignoreInputs: boolean;
    highestServerStep: any;

    /**
      * Create a game engine instance.  This needs to happen
      * once on the server, and once on each client.
      *
      * @param {Object} options - options object
      * @param {Number} options.traceLevel - the trace level.
      */
    constructor(options: EngineOptions, emitter?: EventEmitter.Emitter) {

        // place the game engine in the LANCE globals
        const isServerSide = (typeof window === 'undefined');
        const glob: any = isServerSide ? global : window;
        glob.LANCE = { gameEngine: this };

        // set options
        const defaultOpts: EngineOptions = { traceLevel: Trace.TRACE_NONE };
        if (!isServerSide) defaultOpts.clientIDSpace = 1000000;
        this.options = { ...defaultOpts, ...options };

        /**
         * client's player ID, as a string. If running on the client, this is set at runtime by the clientEngine
         * @member {String}
         */
        this.playerId = NaN;

        // set up event emitting and interface
        this._emitter = emitter || EventEmitter();

        // set up trace
        this.trace = new Trace({ traceLevel: this.options.traceLevel });
    }


    /**
    * Register a handler for an event
    *
    * @method on
    * @memberof GameEngine
    * @instance
    * @param {String} eventName - name of the event
    * @param {Function} eventHandler - handler function
    */
    on(eventName: string, eventHandler: (obj?: any) => void): void {
        this._emitter.on(eventName, eventHandler);
    }

    /**
     * Register a handler for an event, called just once (if at all)
     *
     * @method once
     * @memberof GameEngine
     * @instance
     * @param {String} eventName - name of the event
     * @param {Function} eventHandler - handler function
     */
    once(eventName: string, eventHandler: (obj?: any) => void): void {
        this._emitter.once(eventName, eventHandler);
    }

    /**
     * Remove a handler
     *
     * @method removeListener
     * @memberof GameEngine
     * @instance
     * @param {String} eventName - name of the event
     * @param {Function} eventHandler - handler function
     */
    removeListener(eventName: string, eventHandler: (obj?: any) => void) {
        this._emitter.off(eventName, eventHandler);
    }


    off(eventName: string, eventHandler: (obj?: any) => void) {
        this._emitter.off(eventName, eventHandler);
    }

    emit(eventName: string, ...args: any[]) {
        this._emitter.emit(eventName, ...args);
    }

    /**
     * Find a local copy of a server object
     * @param serverObj 
     */
    findLocalShadow(serverObj: GameObject): GameObject | null {

        for (const [id, localObj] of this.objects) {
            if (id < this.options.clientIDSpace) continue;
            if (localObj.inputId === serverObj.inputId)
                return localObj;
        }

        return null;
    }

    initWorld(worldSettings?: WorldSettings) {
        this.world = new GameWorld({ ...worldSettings, idSpace: this.options.clientIDSpace });
    }

    /**
      * Start the game. This method runs on both server
      * and client. Extending the start method is useful
      * for setting up the game's worldSettings attribute,
      * and registering methods on the event handler.
      */
    start() {
        this.trace.info(() => '========== game engine started ==========');
        this.initWorld();

        // create the default timer
        this.timer = new Timer();
        this.timer.play();
        this.on('postStep', ({ isReenact }) => {
            if (!isReenact) this.timer.tick();
        });

        this.emit('start', { timestamp: (new Date()).getTime() });
    }

    /**
      * Single game step.
      *
      * @param {Boolean} isReenact - is this step a re-enactment of the past.
      * @param {Number} t - the current time (optional)
      * @param {Number} dt - elapsed time since last step was called.  (optional)
      * @param {Boolean} physicsOnly - do a physics step only, no game logic
      */
    step(isReenact: boolean, t?: number, dt?: number, physicsOnly?: boolean,) {
        // physics-only step
        if (physicsOnly) {
            if (dt) dt /= 1000; // physics engines work in seconds
            this.physicsEngine.step(dt, objectFilter);
            return;
        }

        // emit preStep event
        if (isReenact === undefined)
            throw new Error('game engine does not forward argument isReenact to super class');

        isReenact = Boolean(isReenact);
        let step = ++this.world.stepCount;
        let clientIDSpace = this.options.clientIDSpace;
        this.emit('preStep', { step, isReenact, dt });

        // skip physics for shadow objects during re-enactment
        function objectFilter(o) {
            return !isReenact || o.id < clientIDSpace;
        }

        // physics step
        if (this.physicsEngine && !this.ignorePhysics) {
            if (dt) dt /= 1000; // physics engines work in seconds
            this.physicsEngine.step(dt, objectFilter);
        }

        // for each object
        // - apply incremental bending
        // - refresh object positions after physics
        this.objects.forEach((o) => {
            if (typeof o.refreshFromPhysics === 'function')
                o.refreshFromPhysics();
            this.trace.trace(() => `object[${o.id}] after ${isReenact ? 'reenact' : 'step'} : ${o.toString()}`);
        });

        // emit postStep event
        this.emit('postStep', { step, isReenact });
    }

    /**
     * Add object to the game world.
     * On the client side, the object may not be created, if the server copy
     * of this object is already in the game world.  This could happen when the client
     * is using delayed-input, and the RTT is very low.
     *
     * @param {Object} object - the object.
     * @return {Object} the final object.
     */
    addObject(object): Object {

        // if we are asked to create a local shadow object
        // the server copy may already have arrived.
        if (Number(object.id) >= this.options.clientIDSpace) {
            let serverCopyArrived = Array.from(this.objects).some(([_, o]) => o.inputId === object.inputId)
            if (serverCopyArrived) {
                this.trace.info(() => `========== shadow object NOT added ${object.toString()} ==========`);
                return null;
            }
        }

        this.objects.set(object.id, object);

        // tell the object to join the game, by creating
        // its corresponding physical entities and renderer entities.
        if (typeof object.onAddToWorld === 'function')
            object.onAddToWorld(this);

        this.emit('objectAdded', object);
        this.trace.info(() => `========== object added ${object.toString()} ==========`);

        return object;
    }

    /**
     * Override this function to implement input handling.
     * This method will be called on the specific client where the
     * input was received, and will also be called on the server
     * when the input reaches the server.  The client does not call this
     * method directly, rather the client calls {@link ClientEngine#sendInput}
     * so that the input is sent to both server and client, and so that
     * the input is delayed artificially if so configured.
     *
     * The input is described by a short string, and is given an index.
     * The index is used internally to keep track of inputs which have already been applied
     * on the client during synchronization.  The input is also associated with
     * the ID of a player.
     *
     * @param {Object} inputDesc - input descriptor object
     
     * @param {Number} playerId - the player ID
     * @param {Boolean} isServer - indicate if this function is being called on the server side
     */
    abstract processInput(inputDesc: InputDescriptor, playerId: number, isServer: boolean): void

    /**
     * Remove an object from the game world.
     *
     * @param {Object|String} objectId - the object or object ID
     */
    removeObject(ref: GameObjectRef) {

        const id = typeof ref === 'number' ? ref : ref.id

        const object = this.objects.get(id);

        if (!object) {
            throw new Error(`Game attempted to remove a game object which doesn't (or never did) exist, id=${ref}`);
        }
        this.trace.info(() => `========== destroying object ${object.toString()} ==========`);

        if (typeof object.onRemoveFromWorld === 'function')
            object.onRemoveFromWorld(this);

        this.emit('objectDestroyed', object);
        this.objects.delete(id);
    }

    allObjects(): GameObject[] {
        return Array.from(this.objects.values());
    }

    /**
     * Check if a given object is owned by the player on this client
     *
     * @param {Object} object the game object to check
     * @return {Boolean} true if the game object is owned by the player on this client
     */
    isOwnedByPlayer(object): boolean {
        return (object.playerId == this.playerId);
    }

    /**
     * Register Game Object Classes
     *
     * @example
     * registerClasses(serializer) {
     *   serializer.registerClass(Paddle);
     *   serializer.registerClass(Ball);
     * }
     *
     * @param {Serializer} serializer - the serializer
     */
    abstract registerClasses(serializer: Serializer): void;

    /**
     * Decide whether the player game is over by returning an Object, need to be implemented
     *
     * @return {Object} truthful if the game is over for the player and the object is returned as GameOver data
     */
    abstract getPlayerGameOverResult(): Object
}

/**
 * EVENTS
 */

/**
 * Marks the beginning of a new game step
 *
 * @event GameEngine#preStep
 * @param {Number} stepNumber - the step number
 * @param {Boolean} isReenact - is this step a re-enactment
 */

/**
 * Marks the end of a game step
 *
 * @event GameEngine#postStep
 * @param {Number} stepNumber - the step number
 * @param {Boolean} isReenact - is this step a re-enactment
 */

/**
 * An object has been added to the world
 *
 * @event GameEngine#objectAdded
 * @param {Object} obj - the new object
 */

/**
 * An object has been removed from the world
 *
 * @event GameEngine#objectDestroyed
 * @param {Object} obj - the object
 */

/**
 * A player has joined
 *
 * @event GameEngine#playerJoined
 * @param {Number} joinTime - epoch of join time
 * @param {Object} playerDesc - player descriptor
 * @param {String} playerDesc.playerId - the player ID
 */

/**
 * A player has left
 *
 * @event GameEngine#playerDisconnected
 * @param {Number} joinTime - epoch of join time
 * @param {Number} disconnectTime - epoch of disconnect time
 * @param {Object} playerDesc - player descriptor
 * @param {String} playerDesc.playerId - the player ID
 */

/**
 * A player has joined on the server
 *
 * @event GameEngine#server__playerJoined
 * @param {Number} joinTime - epoch of join time
 * @param {Object} playerDesc - player descriptor
 * @param {String} playerDesc.playerId - the player ID
 */

/**
  * A player has left on the server
  *
  * @event GameEngine#server__playerDisconnected
  * @param {Number} joinTime - epoch of join time
  * @param {Number} disconnectTime - epoch of disconnect time
  * @param {Object} playerDesc - player descriptor
  * @param {String} playerDesc.playerId - the player ID
  */

/**
 * A synchronization update arrived from the server
 *
 * @event GameEngine#syncReceived
 * @param {Object} sync - the synchronization object
 */

/**
 * Marks the beginning of a game step on the client
 *
 * @event GameEngine#client__preStep
 */

/**
 * Marks the end of a game step on the client
 *
 * @event GameEngine#client__postStep
 */

/**
 * An input needs to be handled.  Emitted just before the GameEngine
 * method processInput is invoked.
 *
 * @event GameEngine#processInput
 * @param {Object} input - input descriptor object
 * @param {String} input.input - describe the input (e.g. "up", "down", "fire")
 * @param {Number} input.messageIndex - input identifier
 * @param {Object} input.options - the object which was passed as SendInput's InputOptions parameter
 * @param {Number} input.step - input execution step
 * @param {Number} playerId - the player ID
 */

/**
 * An input needs to be handled.
 * This event is emitted on the server only, just before the
 * general processInput event.
 *
 * @event GameEngine#server__processInput
 * @param {Object} input - input descriptor object
 * @param {String} input.input - describe the input (e.g. "up", "down", "fire")
 * @param {Number} input.messageIndex - input identifier
 * @param {Object} input.options - the object which was passed as SendInput's InputOptions parameter
 * @param {Number} input.step - input execution step
 * @param {Number} playerId - the player ID
 */

/**
 * Client moved from one room to another
 *
 * @event GameEngine#server__roomUpdate
 * @param {Number} playerId - the player ID
 * @param {String} from - the room from which the client came
 * @param {String} to - the room to which the client went
 */

/**
 * An input needs to be handled.
 * This event is emitted on the client only, just before the
 * general processInput event.
 *
 * @event GameEngine#client__processInput
 * @param {Object} input - input descriptor object
 * @param {String} input.input - describe the input (e.g. "up", "down", "fire")
 * @param {Number} input.messageIndex - input identifier
 * @param {Object} input.options - the object which was passed as SendInput's InputOptions parameter
 * @param {Number} input.step - input execution step
 * @param {Number} playerId - the player ID
 */

/**
 * Client received a sync from the server
 *
 * @event GameEngine#client__syncReceived
 * @param {Object} sync - sync from the server
 * @param {Array} syncEvents - array of events in the sync
 * @param {Number} maxStepCount - highest step in the sync
 */

/**
 * Client moved from one room to another
 *
 * @event GameEngine#client__roomUpdate
 * @param {Number} playerId - the player ID
 * @param {String} from - the room from which the client came
 * @param {String} to - the room to which the client went
 */

/**
 * Client reset the world step
 *
 * @event GameEngine#client__stepReset
 * @param {Object} resetDesc - sync from the server
 * @param {Number} oldStep - the old step count
 * @param {Number} newStep - the new step count
 */

/**
 * Marks the beginning of a game step on the server
 *
 * @event GameEngine#server__preStep
 * @param {Number} stepNumber - the step number
 */

/**
 * Marks the end of a game step on the server
 *
 * @event GameEngine#server__postStep
 * @param {Number} stepNumber - the step number
 */

/**
 * User input received on the server
 *
 * @event GameEngine#server__inputReceived
 * @param {Object} input - input descriptor
 * @param {Object} input.data - input descriptor
 * @param {String} input.playerId - player that sent the input
 */

/**
 * Report slow frame rate on the browser.
 * The browser did not achieve a reasonable frame rate
 *
 * @event GameEngine#client__slowFrameRate
 */

/**
 * server has started
 *
 * @event GameEngine#start
 * @param {Number} timestamp - UTC epoch of start time
 */

// TODO: the declaration "export default" could be done as part of the class
// declaration up above, but the current version of jsdoc doesn't support this.
// when jsdoc is fixed, move this descriptor back to the class declaration,
// in all relevant files (12 files)
// see: https://github.com/jsdoc3/jsdoc/issues/1132
export default GameEngine;
