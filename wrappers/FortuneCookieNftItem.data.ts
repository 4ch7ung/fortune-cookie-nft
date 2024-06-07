import { Address, beginCell, Cell } from "@ton/core";
import { FortuneCookieCollectionMintItemInput } from "./FortuneCookieNftCollection.data";
import { encodeOffChainContent } from "../utils/nftContentUtils";


export const OperationCodes = {
    transfer: 0x5fcc3d14,
    getStaticData: 0x2fcb26a2,
    getStaticDataResponse: 0x8b771735,
    unseal: 0xc35b85d1,
}

export const Queries = {
    initialize: (data: FortuneCookieCollectionMintItemInput) => {
        const dataCell = beginCell()
            .storeAddress(data.ownerAddress)
            .storeUint(data.lowerBound, 32)
            .storeUint(data.upperBound, 32)
            .storeRef((encodeOffChainContent(data.content)))
            .endCell();

        return dataCell;
    },
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
    unseal: (params: { queryId?: number }) => {
        const msgBody = beginCell()
            .storeUint(OperationCodes.unseal, 32)
            .storeUint(params.queryId || 0, 64);

        return msgBody.endCell();
    }
}
