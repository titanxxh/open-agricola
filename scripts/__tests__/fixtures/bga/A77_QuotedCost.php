<?php
namespace AGR\Cards;
class A77_QuotedCost extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Quoted Cost Card');
    $this->deck = 'A';
    $this->number = 77;
    $this->cost = [WOOD => '2', REED => "1"];
  }
}
