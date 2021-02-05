import Utils from '../lib/Utils';
import BaseTypes, { SerializableCompoundType } from './BaseTypes';
import { getNetScheme, networked } from './NetworkScheme';

abstract class Serializable implements SerializableCompoundType<any>{
    @networked(BaseTypes.UINT8)
    readonly classId: number = Utils.hashStr(this.constructor.name);
    private get netScheme() { return getNetScheme(this) }

    size() {
        let size = 0;
        for (const [key, { type }] of Object.entries(this.netScheme)) {
            if (type.size instanceof Function) {
                size += type.size(this[key])
            } else if (typeof type.size === 'number') {
                size += type.size;
            }
        }
        return size;
    }

    get modified() {
        return Object.values(this.netScheme).some((s) => s.modified)
    }

    write(_, dataView: DataView, offset = 0): number {
        let bytesWritten = 0; // used for counting the bufferOffset
        const netScheme = this.netScheme
        if (!netScheme) throw { message: `No net scheme defined for class ${this.constructor.name}` }

        // first set the id of the class, so that the deserializer can fetch information about it
        netScheme.classId.type.write(this.classId, dataView, offset);

        // advance the offset counter
        bytesWritten += Uint8Array.BYTES_PER_ELEMENT;

        for (const [key, {type}] of Object.entries(this.netScheme)) {
            const type = this.netScheme[property].type;
            if (type instanceof Serializable) {
                bytesWritten += type.serialize(dataView, offset + bytesWritten);
            } else if (type.hasOwnProperty('write')) {
                bytesWritten += type.write(this[property], dataView, offset + bytesWritten);
            }
        }

        return bytesWritten;
    }

    prune(prev) {

    }
    // build a clone of this object with pruned strings (if necessary)
    prunedStringsClone(serializer, prevObject) {

        if (!prevObject) return this;
        prevObject = serializer.deserialize(prevObject).obj;

        // get list of string properties which changed
        let netScheme = this.constructor.netScheme;
        let isString = p => netScheme[p] === BaseTypes.STRING;
        let hasChanged = p => prevObject[p] !== this[p];
        let changedStrings = Object.keys(netScheme).filter(isString).filter(hasChanged);
        if (changedStrings.length == 0) return this;

        // build a clone with pruned strings
        let prunedCopy = this.constructor(null, { id: null });
        for (let p of Object.keys(netScheme))
            prunedCopy[p] = changedStrings.indexOf(p) < 0 ? this[p] : null;

        return prunedCopy;
    }

    syncTo(other) {
        for (let p of Object.keys(this.netScheme)) {

            // ignore classes and lists
            if (netScheme[p] === BaseTypes.LIST || netScheme[p] === BaseTypes.CLASSINSTANCE)
                continue;

            // strings might be pruned
            if (netScheme[p] === BaseTypes.STRING) {
                if (typeof other[p] === 'string') this[p] = other[p];
                continue;
            }

            // all other values are copied
            this[p] = other[p];
        }
    }


}

export default Serializable;
