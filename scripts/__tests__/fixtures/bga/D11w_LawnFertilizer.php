<?php
namespace AGR\Cards;
class D11w_LawnFertilizer extends Card
{
  public function __construct()
  {
    $this->name = clienttranslate('Lawn Fertilizer (canonical)');
    $this->deck = 'D';
    $this->number = 11;
    $this->category = FARM_PLANNER;
  }
}
