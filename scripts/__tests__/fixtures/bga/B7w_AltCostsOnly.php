<?php
namespace AGR\Cards;
class B7w_AltCostsOnly extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('AltCosts Only');
    $this->deck = 'B';
    $this->number = 7;
    $this->costs = [[WOOD => 1], [FOOD => 2]];
  }
}
