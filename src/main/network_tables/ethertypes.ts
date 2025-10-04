export const ETHERTYPES: Record<number, string> = {

  0x0800: "IPv4",
  0x0806: "ARP",
  0x0842: "WoL",                  //wake-on-lan
  0x22EA: "SRP",                  //Stream Reservation Protocol
  0x22F0: "AVTP",                 //Audio Video Transport Protocol
  0x8035: "RARP",                 //Reverse Address Resolution Protocol
  0x8100: "VLAN",                 //VLAN-tagged frame
  0x86DD: "IPv6",
  0x8808: "EthFlowCtrl",
  0x8847: "MPLSU",
  0x8848: "MPLSM",
  0x8863: "PPPoED",               //Discovery
  0x8864: "PPPoES",               //Session
  0x8892: "PROFITNET",
  0x88CC: "LLDP",
  0x88E5: "MACsec",
  0x88F7: "PTP",                  //Precision Time Protocol
  0x8906: "FCoE",                 //Fiber Channel over Ethernet
  0x8915: "RoCE"                  //RDMA over Converged Ethernet
    
}