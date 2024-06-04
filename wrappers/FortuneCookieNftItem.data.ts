import { Address, beginCell, Cell } from "@ton/core";

export type FortuneCookieNftItemData = {
    index: number
    collectionAddress: Address | null
    ownerAddress: Address
    lowerBound: number
    upperBound: number
    unsealedValue: number | null
    content: string
}

//  uint64 index
//  MsgAddressInt collection_address
//  MsgAddressInt owner_address
//  cell bounds_and_value
//      uint32 lower_bound
//      uint32 upper_bound
//      uint32 unsealed_value
//  cell content

export function buildFortuneCookieNftItemDataCell(data: FortuneCookieNftItemData) {
    const contentCell = beginCell()
        .storeBuffer(Buffer.from(data.content));

    const boundsAndValue = beginCell()
        .storeUint(data.lowerBound, 32)
        .storeUint(data.upperBound, 32)
        .storeUint(data.unsealedValue || 0, 32)
        .endCell();

    const dataCell = beginCell()
        .storeUint(data.index, 64)
        .storeAddress(data.collectionAddress)
        .storeAddress(data.ownerAddress)
        .storeRef(boundsAndValue)
        .storeRef(contentCell)
        .endCell();

    return dataCell;
}

export const OperationCodes = {
    transfer: 0x5fcc3d14,
    getStaticData: 0x2fcb26a2,
    getStaticDataResponse: 0x8b771735,
    GetRoyaltyParams: 0x693d3950,
    GetRoyaltyParamsResponse: 0xa8cb00ad,
    unseal: 0xc35b85d1,
}

export const Queries = {
    transfer: (params: { queryId?: number; newOwner: Address; responseTo?: Address; forwardAmount?: bigint, forwardPayload?: Cell }) => {
        const msgBody = beginCell()
            .storeUint(OperationCodes.transfer, 32)
            .storeUint(params.queryId || 0, 64)
            .storeAddress(params.newOwner)
            .storeAddress(params.responseTo || null)
            .storeBit(false) // no custom payload
            .storeCoins(params.forwardAmount || 0);

        if (params.forwardPayload) {
            msgBody.storeSlice(params.forwardPayload.asSlice());
        } else {
            msgBody.storeBit(0); // no forward_payload yet
        }

        return msgBody.endCell();
    },
    getStaticData: (params: {queryId?: number}) => {
        const msgBody = beginCell()
            .storeUint(OperationCodes.getStaticData, 32)
            .storeUint(params.queryId || 0, 64);

        return msgBody.endCell();
    },
    getRoyaltyParams: (params: { queryId?: number }) => {
        const msgBody = beginCell()
            .storeUint(OperationCodes.GetRoyaltyParams, 32)
            .storeUint(params.queryId || 0, 64);

        return msgBody.endCell();
    },
    unseal: (params: { queryId?: number }) => {
        const msgBody = beginCell()
            .storeUint(OperationCodes.unseal, 32)
            .storeUint(params.queryId || 0, 64);

        return msgBody.endCell();
    }
}
