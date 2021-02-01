declare interface SerializableDataType<T> {
  write: (value: T, data: DataView, offset: number) => number;
  read: (buffer: DataView, offset: number) => { value: T, bytesRead: number }
}

export const FLOAT32: SerializableDataType<number> = {
  write: (value: number, data: DataView, offset: number) => {
    data.setFloat32(offset, value);
    return Float32Array.BYTES_PER_ELEMENT
  },
  read: (buffer: DataView, offset: number) => ({
    value: buffer.getFloat32(offset),
    bytesRead: Float32Array.BYTES_PER_ELEMENT
  }),
}

export const INT32: SerializableDataType<number> = {
  write: (value: number, data: DataView, offset: number) => {
    data.setInt32(offset, value)
    return Int32Array.BYTES_PER_ELEMENT
  },
  read: (buffer: DataView, offset: number) => ({
    value: buffer.getInt32(offset),
    bytesRead: Int32Array.BYTES_PER_ELEMENT
  }),
}

export const INT16: SerializableDataType<number> = {
  write: (value: number, data: DataView, offset: number) => {
    data.setInt16(offset, value);
    return Int16Array.BYTES_PER_ELEMENT
  },
  read: (buffer: DataView, offset: number) => ({
    value: buffer.getInt16(offset),
    bytesRead: Int16Array.BYTES_PER_ELEMENT
  }),
}


export const INT8: SerializableDataType<number> = {
  write: (value: number, data: DataView, offset: number) => {
    data.setInt8(offset, value);
    return Int8Array.BYTES_PER_ELEMENT
  },
  read: (buffer: DataView, offset: number) => ({
    value: buffer.getInt8(offset),
    bytesRead: Int8Array.BYTES_PER_ELEMENT
  }),
}

export const UINT8: SerializableDataType<number> = {
  write: (value: number, data: DataView, offset: number) => {
    data.setUint8(offset, value)
    return Uint8Array.BYTES_PER_ELEMENT
  },
  read: (buffer: DataView, offset: number) => ({
    value: buffer.getUint8(offset),
    bytesRead: Uint8Array.BYTES_PER_ELEMENT
  }),
}

const MAX_UINT_16 = 0xFFFF;

export const CHAR: SerializableDataType<string> = {
  write: (value: string, data: DataView, offset: number) => {
    data.setUint16(offset, value.charCodeAt(0));
    return Uint16Array.BYTES_PER_ELEMENT;
  },
  read: (buffer: DataView, offset: number) => ({
    value: String.fromCharCode(buffer.getUint16(offset)),
    bytesRead: Uint16Array.BYTES_PER_ELEMENT
  })
}

export function LIST<T>(itemType: SerializableDataType<T>): SerializableDataType<T[]> {
  return {
    read: (buffer: DataView, offset: number): { value: T[], bytesRead: number } => {
      const count = buffer.getUint16(offset);
      let bytesRead = Uint16Array.BYTES_PER_ELEMENT;

      // Indicates the list has not changed
      if (count === MAX_UINT_16) return { value: null, bytesRead }

      const items: T[] = [];
      for (let i = 0; i < count; i++) {
        const { value, bytesRead: br } = itemType.read(buffer, offset + bytesRead);
        items.push(value);
        bytesRead += br;
      }
      return { value: items, bytesRead };
    },
    write: (value: T[], data: DataView, offset: number) => {
      let bytesWritten = 0;

      // Reserved for lists that have not changed
      if (value === null) {
        data.setUint16(offset, MAX_UINT_16);
        return Uint16Array.BYTES_PER_ELEMENT;
      }

      // Set the list length
      data.setUint16(offset, value.length);
      bytesWritten += Uint16Array.BYTES_PER_ELEMENT;

      for (const item of value) {
        bytesWritten += itemType.write(item, data, offset + bytesWritten);
      }

      return bytesWritten;
    }
  }
}

export const STRING = LIST(CHAR);