import { Address, Cell, Contract, ContractProvider, SendMode, Sender, beginCell, contractAddress, toNano } from "@ton/core";
import { decodeOffChainContent } from "../utils/nftContentUtils";
import { Queries } from "./FortuneCookieNftItem.data";
import { FortuneCookieCollectionMintItemInput } from "./FortuneCookieNftCollection.data";

export class FortuneCookieNftItem implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell, data: Cell }
  ) {}

  static createFromConfig(index: number, collectionAddress: Address, code: Cell, workchain = 0) {
    const data = beginCell()
      .storeUint(index, 64)
      .storeAddress(collectionAddress)
      .endCell();
    const init = { code, data };
    const address = contractAddress(workchain, init);
    
    return new FortuneCookieNftItem(address, init);
  }

  // used to top up the contract balance
  async sendTopUp(provider: ContractProvider, sender: Sender, value: bigint) {
    return await provider.internal(sender, {
      value,
      body: beginCell().endCell(), 
    });
  }

  // accepts messages only from the collection contract
  async sendDeploy(
    provider: ContractProvider, 
    sender: Sender,
    value: bigint,
    input: FortuneCookieCollectionMintItemInput
  ) {
    const msgBody = Queries.initialize(input);

    return await provider.internal(sender, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: msgBody,
    });
  }

  //
  // Get methods
  //

  async getNftData(provider: ContractProvider) {
    const { stack } = await provider.get('get_nft_data', []);

    const isInitialized = stack.readNumber() == -1;
    const index = stack.readNumber();
    const collectionAddress = stack.readAddress();
    if(!isInitialized) {
      return {
        initialized: isInitialized,
        index: index,
        collectionAddress: collectionAddress
      };        
    }
    const ownerAddress = stack.readAddress();
    const content = stack.readCell();

    return {
      initialized: isInitialized,
      index: index,
      collectionAddress: collectionAddress,
      ownerAddress: ownerAddress,
      content: decodeOffChainContent(content),
      contentRaw: content
    };
  }

  async getLuckyValue(provider: ContractProvider) {
    const { stack } = await provider.get('get_lucky_value', []);

    return stack.readNumber();
  }

  //
  // Internal messages
  //

  async sendTransfer(
    provider: ContractProvider,
    sender: Sender,
    newOwner: Address,
    responseTo?: Address,
    forwardAmount?: bigint,
    forwardPayload?: Cell
  ) {
    const msgBody = Queries.transfer({ newOwner, responseTo, forwardAmount, forwardPayload });

    return await provider.internal(sender, {
      value: toNano('0.05'),
      body: msgBody
    });
  }

  async sendUnseal(provider: ContractProvider, sender: Sender) {
    const msgBody = Queries.unseal({});

    return await provider.internal(sender, {
      value: toNano('0.05'),
      body: msgBody
    });
  }

  async sendGetStaticData(
    provider: ContractProvider, 
    sender: Sender,
    queryId?: number
  ) {
    const msgBody = Queries.getStaticData({ queryId });

    return await provider.internal(sender, {
      value: toNano('0.1'),
      body: msgBody
    });
  }
}