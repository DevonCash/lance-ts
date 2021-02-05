export interface SerializableDataType<T> {
  size: number,
  write: (value: T, data: DataView, offset: number) => void;
  read: (data: DataView, offset: number) => T;
}

export interface SerializableCompoundType<T> {
  size: (value) => number;
  write: (value: T, data: DataView, offset: number) => number;
  read: (data: DataView, offset: number) => { value: T, bytesRead: number }
}

const FLOAT32: SerializableDataType<number> = {
  size: Float32Array.BYTES_PER_ELEMENT,
  write: (value, data, offset) => data.setFloat32(offset, value),
  read: (data, offset) => data.getFloat32(offset),
}

const INT32: SerializableDataType<number> = {
  size: Int32Array.BYTES_PER_ELEMENT,
  write: (value, data, offset) => data.setInt32(offset, value),
  read: (data, offset) => data.getInt32(offset)
}

const INT16: SerializableDataType<number> = {
  size: Int16Array.BYTES_PER_ELEMENT,
  write: (value, data, offset) => data.setInt16(offset, value),
  read: (data, offset) => data.getInt16(offset)
}


const INT8: SerializableDataType<number> = {
  size: Int8Array.BYTES_PER_ELEMENT,
  write: (value, data, offset) => data.setInt8(offset, value),
  read: (data, offset) => data.getInt8(offset)
}

const UINT8: SerializableDataType<number> = {
  size: Uint8Array.BYTES_PER_ELEMENT,
  write: (value, data, offset) => data.setUint8(offset, value),
  read: (data, offset) => data.getUint8(offset)
}

const MAX_UINT_16 = 0xFFFF;

const CHAR: SerializableDataType<string> = {
  size: Uint16Array.BYTES_PER_ELEMENT,
  write: (value, data, offset) => data.setUint16(offset, value.charCodeAt(0)),
  read: (data, offset) => String.fromCharCode(data.getUint16(offset))
}

function LIST<T>(itemType: SerializableDataType<T>): SerializableCompoundType<T[]> {
  return {
    size: (value) => Uint16Array.BYTES_PER_ELEMENT + (itemType.size as number) * value.length,
    read: (data, offset) => {
      const count = data.getUint16(offset);
      let bytesRead = Uint16Array.BYTES_PER_ELEMENT;

      const items: T[] = [];
      for (let i = 0; i < count; i++) {
        items.push(itemType.read(data, offset + bytesRead));
        bytesRead += (itemType.size);
      }
      return { value: items, bytesRead };
    },
    write: (value, data, offset) => {
      let bytesWritten = 0;

      // Set the list length
      data.setUint16(offset, value.length);
      bytesWritten += Uint16Array.BYTES_PER_ELEMENT;

      for (const item of value) {
        itemType.write(item, data, offset + bytesWritten);
        bytesWritten += itemType.size;
      }

      return bytesWritten;
    }
  }
}

const STRING = LIST(CHAR);



export default {
  FLOAT32,
  INT32,
  INT16,
  INT8,
  UINT8,
  CHAR,
  STRING,
  LIST
}