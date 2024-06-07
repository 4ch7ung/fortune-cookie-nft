import { Cell, beginCell } from "@ton/core";

const OFF_CHAIN_CONTENT_PREFIX = 0x01

export function flattenSnakeCell(cell: Cell) {
    let currentCell: Cell | null = cell

    let result = Buffer.alloc(0)

    while (currentCell) {
        let cs = currentCell.beginParse()
        if (cs.remainingBits % 8 !== 0) {
            throw Error('Number remaining of bits is not multiply of 8');
        }
        let data = cs.loadBuffer(cs.remainingBits / 8)
        result = Buffer.concat([result, data])
        currentCell = currentCell.refs[0]
    }

    return result
}

function bufferToChunks(buff: Buffer, chunkSize: number) {
    let chunks: Buffer[] = []
    while (buff.byteLength > 0) {
        chunks.push(buff.subarray(0, chunkSize))
        buff = buff.subarray(chunkSize)
    }
    return chunks
}

function _snakeCell(chunks: Buffer[]): Cell | null {
    const thisChunk = chunks.pop();
    if (!thisChunk) {
        return null;
    }

    const thisCell = beginCell()
        .storeBuffer(thisChunk);

    if (chunks.length > 0) {
        const innerCell = _snakeCell(chunks);
        if (innerCell) {
            thisCell.storeRef(innerCell);
        }
    }

    return thisCell.endCell();
}

export function makeSnakeCell(data: Buffer) {
    let chunks = bufferToChunks(data, 127).reverse();
    
    if (chunks.length === 0) {
        return beginCell().endCell(); // practically impossible
    }

    let rootCell = _snakeCell(chunks);
    if (!rootCell) {
        throw new Error('Failed to create snake cell');
    }
    return rootCell;
}

export function encodeOffChainContent(content: string) {
    let data = Buffer.from(content)
    let offChainPrefix = Buffer.from([OFF_CHAIN_CONTENT_PREFIX])
    data = Buffer.concat([offChainPrefix, data])
    return makeSnakeCell(data)
}

export function decodeOffChainContent(content: Cell) {
    let data = flattenSnakeCell(content)

    let prefix = data[0]
    if (prefix !== OFF_CHAIN_CONTENT_PREFIX) {
        throw new Error(`Unknown content prefix: ${prefix.toString(16)}`)
    }
    return data.subarray(1).toString()
}