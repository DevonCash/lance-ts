// The base Physics Engine class defines the expected interface
// for all physics engines


export default abstract class PhysicsEngine {

    options: any;

    constructor(options) {
        this.options = options;
    }

    /**
     * A single Physics step.
     *
     * @param {Number} dt - time elapsed since last step
     * @param {Function} objectFilter - a test function which filters which objects should move
     */
    abstract step(dt: number, objectFilter: (...args: any) => boolean)

}
