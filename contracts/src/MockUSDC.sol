// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockUSDC — 6-decimal ERC20 used in the spend-account demo.
/// @notice Not a production token. Mints freely to any address so reviewers
///         can fund the smart account on a fresh Base Sepolia wallet without
///         a faucet round-trip. The production deployment must replace this
///         with canonical USDC at 0x036CbD53842c5426634e7929541eC2318f3dCF7e (Base Sepolia).
contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "USDC";
    uint8  public constant decimals = 6;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool ok) {
        ok = _transfer(msg.sender, to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool ok) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        ok = true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool ok) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }
        ok = _transfer(from, to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal returns (bool) {
        require(to != address(0), "to=0");
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
