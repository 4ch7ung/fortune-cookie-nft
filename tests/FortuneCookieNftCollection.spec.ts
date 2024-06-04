import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { FortuneCookieNftCollection } from '../wrappers/FortuneCookieNftCollection';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('FortuneCookieNftCollection', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('FortuneCookieNftCollection');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let fortuneCookieNftCollection: SandboxContract<FortuneCookieNftCollection>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        fortuneCookieNftCollection = blockchain.openContract(FortuneCookieNftCollection.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await fortuneCookieNftCollection.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: fortuneCookieNftCollection.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and fortuneCookieNftCollection are ready to use
    });
});
