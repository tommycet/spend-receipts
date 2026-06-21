// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SpendAccount} from "../src/SpendAccount.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MockVendor} from "../src/MockVendor.sol";

/// @notice One-shot deploy that wires up everything the demo needs:
///         MockUSDC, SpendAccount, three MockVendors (research / images /
///         other). Vendors auto-approve the SpendAccount so refunds work
///         without a manual approval step.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        console2.log("deployer:", deployer);

        // Demo owner / agent split. In production these are distinct
        // accounts (the agent is a hot key the owner delegates to).
        // For the hackathon reviewer we keep them identical so a single
        // MetaMask account can run the whole demo - the brief's 6 steps
        // do not require a second signer.
        address owner = vm.envOr("OWNER_ADDRESS", deployer);
        address agent = vm.envOr("AGENT_ADDRESS", owner);

        vm.startBroadcast(pk);

        MockUSDC usdc = new MockUSDC();
        console2.log("MockUSDC:        ", address(usdc));

        SpendAccount acct = new SpendAccount(usdc, owner, agent);
        console2.log("SpendAccount:    ", address(acct));

        MockVendor research = new MockVendor(usdc, "Research API Co");
        MockVendor images   = new MockVendor(usdc, "Stock Image Co");
        MockVendor other    = new MockVendor(usdc, "Contractor");

        // Vendors pre-approve the SpendAccount for the max so refunds work.
        // In production each vendor would do this on payment receipt.
        research.approveSpender(address(acct));
        images.approveSpender(address(acct));
        other.approveSpender(address(acct));

        console2.log("Vendor Research: ", address(research));
        console2.log("Vendor Images:   ", address(images));
        console2.log("Vendor Other:    ", address(other));

        vm.stopBroadcast();

        // Emit a machine-readable JSON blob the frontend bootstrap reads.
        string memory json = string(
            abi.encodePacked(
                '{"usdc":"', vm.toString(address(usdc)),
                '","spendAccount":"', vm.toString(address(acct)),
                '","vendorResearch":"', vm.toString(address(research)),
                '","vendorImages":"', vm.toString(address(images)),
                '","vendorOther":"', vm.toString(address(other)),
                '","owner":"', vm.toString(owner),
                '","agent":"', vm.toString(agent),
                '","chainId":"', vm.toString(block.chainid),
                '"}'
            )
        );
        vm.writeFile("./deployments/latest.json", json);
        console2.log("wrote deployments/latest.json");
    }
}
